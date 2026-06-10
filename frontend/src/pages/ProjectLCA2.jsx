import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, X, Info, Lock, LockOpen } from "lucide-react";
import { apiFetch } from "../api";
import {
  normStr, isFenetreCategory, isIsolantCategory, isCadreCategory,
  getLambda, isParoiExterieure, isParoiEligibleAjoutIsolant,
  getComposantR, generateEpaisseurPaliers, makeComboKey,
} from "../utils/lca2-helpers.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAUFFAGE_OPTIONS = [
  { id: "gaz",        label: "Chaudière gaz",    co2: 0.205, rendement: 0.90 }, // IPCC 2006 Vol.2 Annex 1 Table 1.3
  { id: "mazout",     label: "Chaudière mazout",  co2: 0.265, rendement: 0.85 },
  { id: "bois",       label: "Chaudière bois",    co2: 0.030, rendement: 0.75 },
  { id: "pac",        label: "Pompe à chaleur",   co2: 0.132, rendement: 3.0  }, // AIB 2024 via VREG
  { id: "electrique", label: "Électrique direct", co2: 0.132, rendement: 1.0  }, // AIB 2024 via VREG
];

const PRIX_KWH_BY_CHAUFFAGE = {
  gaz:        0.095,
  mazout:     0.10,
  bois:       0.08,
  pac:        0.345,
  electrique: 0.345,
};

// Facteur déconstruction — EN 15978 Module C. Source : ACV interne (procédé C1, par tonne).
// Valeurs PAR KG (= valeur par tonne / 1000) — masses code en kg, produit direct sans facteur 1000.
// GWP = climate change total (EF v3.1 / IPCC AR6 2021) ; fiches matériaux en EF v3.0 / IPCC AR5 2013 (Δ < 2 %).
const DECON_IMPACTS_PER_KG = {
  gwp100:    0.007209,   // kg CO₂eq/kg  (7,209 kg CO₂eq/tonne)
  energy_nr: 0.093856,   // MJ/kg        (93,856 MJ/tonne)
  sante:     9.82e-8,    // kg NMVOC eq/kg (0,0982 kg/tonne)
};

const PAROI_TYPES = ["mur", "toiture", "plancher", "cloison"];
const PAROI_TYPE_LABELS = {
  mur:      "Mur extérieur",
  toiture:  "Toiture",
  plancher: "Plancher",
  cloison:  "Cloison intérieure",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function fmt(v) {
  if (v == null) return "—";
  return Math.round(v).toLocaleString("fr-BE");
}

function fmtDec(v, dec = 2) {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function fmtSmall(v) {
  if (v == null) return "—";
  if (v === 0) return "0";
  if (Math.abs(v) < 0.001) return v.toExponential(2);
  if (Math.abs(v) < 1) return v.toPrecision(3);
  return fmt(v);
}

function extractImpact(impacts, ...keys) {
  if (!impacts || typeof impacts !== "object") return null;
  const norm = Object.fromEntries(
    Object.entries(impacts).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const k of keys) {
    const val = norm[k.toLowerCase()];
    if (val != null) return parseFloat(val);
  }
  return null;
}


// ── Convention sémantique de valeur_r (refonte conceptuelle) ─────────────────
// valeur_r est un R thermique direct (m²·K/W) pour TOUS les non-isolants.
//   Mur, Toiture, Plancher, Cloison, Parement → R direct (config FDES figée)
//   Vitrage (Fenêtre), Cadre                  → R direct
//   Isolant                                   → 1.0 (référence Conv. 2, λ dans impacts.valeur_lambda)
// Dans les snapshots composants, lambda_lib = valeur_r (R direct pour non-isolants).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Optimisation helpers ─────────────────────────────────────────────────────

// Fix 2 — Hash djb2 (pas de dépendance externe)
function djb2Hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
}

function computeConfigHash(bat, materials) {
  const changeables = [];
  for (const paroi of bat.parois) {
    if (paroi.is_fixed) continue;
    for (const co of paroi.composantsOpaques) {
      if (!co.is_fixed) changeables.push({ id: co.material_id, q: String(co.surface_m2 ?? ""), e: String(co.efficacite ?? 100) });
    }
    for (const bv of paroi.baiesVitrees) {
      const bvSpu = parseFloat(bv.surface_par_unite);
      const bvQs = (isFinite(bvSpu) && bvSpu > 0)
        ? String((parseFloat(bv.quantite) || 1) * bvSpu)
        : String(bv.surface_vitree_m2 ?? "");
      if (!bv.is_fixed) changeables.push({ id: bv.material_id, cadreId: bv.cadre_id ?? null, q: bvQs, e: String(bv.efficacite ?? 100) });
    }
  }
  changeables.sort((a, b) => a.id.localeCompare(b.id));

  const matLib = materials.map(m => ({
    i:  m.id,
    p:  m.prix ?? null,
    r:  m.valeur_r ?? null,
    g:   extractImpact(m.impacts, "gwp100", "gwp_100") ?? null,
    en:  extractImpact(m.impacts, "energy_nonrenewable_adp", "energy_nonrenewable") ?? null,
    sa:  extractImpact(m.impacts, "photochemical_oxidant_hh", "photochemical_oxidant") ?? null,
    dvr: m.dvr_materiau ?? null,
    pw:  m.poids_unite  ?? null,
  }));
  matLib.sort((a, b) => a.i.localeCompare(b.i));

  const ch = CHAUFFAGE_OPTIONS.find(o => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const energy = { dj: bat.degres_jours, rdt: ch.rendement, co2: ch.co2 };

  return djb2Hash(JSON.stringify({ changeables, matLib, energy }));
}

// Génération des combinaisons — stratégie 3 listes (ACV 2.0)
function buildCombinations(bat, materials, epIsolantMaxRaw) {
  const PER_SLOT    = 5;      // max candidats par slot opaque/vitrage/cadre
  const SAFETY_CAP  = 50_000; // plafond de sécurité pour l'énumération
  const EP_ISO_STEP = 2.5;    // pas des paliers d'épaisseur isolant (cm), dimensions commerciales
  const epIsoMax = (isFinite(parseFloat(epIsolantMaxRaw)) && parseFloat(epIsolantMaxRaw) > 0)
    ? parseFloat(epIsolantMaxRaw)
    : 20;

  const slots = [];
  const fixedDueToConstraint = [];

  for (const paroi of bat.parois) {
    if (paroi.is_fixed) continue;
    const sOpaqueParoi = calcParoiStats(paroi)?.s_opaque ?? parseFloat(paroi.surface_totale) ?? 0;
    for (const co of paroi.composantsOpaques) {
      if (co.is_fixed) continue;
      const curMat = materials.find(m => m.id === co.material_id);
      const curCat = curMat ? (curMat.category || "Autre") : "Autre";

      let allCatMats = materials
        .filter(m => !isFenetreCategory(m.category || "Autre") && (m.category || "Autre") === curCat)
        .sort((a, b) => (parseFloat(a.prix) || 0) - (parseFloat(b.prix) || 0));

      const hadAlternatives = allCatMats.some(m => m.id !== co.material_id);

      // Filtre de non-dégradation thermique : U_alternatif ≤ U_effectif_actuel
      const rCurrentEff = getComposantREffectif(co);
      if (rCurrentEff != null && rCurrentEff > 0) {
        allCatMats = allCatMats.filter(m => {
          if (m.id === co.material_id) return true;
          // Isolants : R thermique calculé via r_cible (préservé par ...co), pas via m.valeur_r.
          // Accepter si le candidat a un flux_reference valide pour le calcul ACV.
          if (isIsolantCategory(co.category)) {
            return m.flux_reference != null && m.flux_reference > 0;
          }
          const r_candidat = parseFloat(m.valeur_r);
          if (!isFinite(r_candidat) || r_candidat <= 0) return false;
          return r_candidat >= rCurrentEff;
        });
        if (hadAlternatives && !allCatMats.some(m => m.id !== co.material_id)) {
          fixedDueToConstraint.push({ compName: co.material_name || (curMat?.name ?? "?"), paroiNom: paroi.nom });
        }
      }

      let altMats = allCatMats.slice(0, PER_SLOT);
      if (!altMats.find(m => m.id === co.material_id) && curMat) {
        altMats = [curMat, ...altMats].slice(0, PER_SLOT);
      }

      // originalEp : épaisseur statu quo du composant isolant (cm), pour sqKey
      const originalEp = (() => {
        if (!isIsolantCategory(co.category)) return null;
        const rCo = parseFloat(co.r_cible);
        const lambda = getLambda(curMat);
        if (!isFinite(rCo) || rCo <= 0 || !isFinite(lambda) || lambda <= 0) return null;
        return Math.round(rCo * lambda * 100 * 10) / 10;
      })();

      let candidates;
      if (isIsolantCategory(co.category)) {
        // ── Isolants : paliers d'épaisseur par matériau candidat (Approche C) ──
        candidates = [];
        for (const m of altMats) {
          const lambda = getLambda(m);
          if (!isFinite(lambda) || lambda <= 0) continue;

          // Épaisseur statu quo pour ce matériau (r_cible × lambda × 100)
          const sqEp = (() => {
            const rCo = parseFloat(co.r_cible);
            if (!isFinite(rCo) || rCo <= 0) return null;
            return Math.round(rCo * lambda * 100 * 10) / 10;
          })();

          // Borne inférieure : épaisseur effective actuelle arrondie au palier sup.
          const epActuelle = rCurrentEff != null && rCurrentEff > 0
            ? rCurrentEff * lambda * 100
            : (sqEp ?? EP_ISO_STEP);
          let paliers = generateEpaisseurPaliers(epActuelle, epIsoMax, EP_ISO_STEP);
          if (paliers.length === 0) continue;

          // Insertion forcée du statu quo si même matériau et pas déjà présent
          if (m.id === co.material_id && sqEp != null) {
            if (!paliers.some(ep => Math.abs(ep - sqEp) < 0.01)) {
              paliers.unshift(sqEp);
              paliers = [...new Set(paliers.map(ep => Math.round(ep * 100) / 100))]
                .filter(ep => ep <= epIsoMax + 0.01);
            }
          }

          for (const ep_cm of paliers) {
            candidates.push({
              ...co,
              material_id:    m.id,
              material_name:  m.name,
              lambda_lib:     lambda,
              r_local:        "",
              lambda_local:   "",
              r_cible:        String((ep_cm / 100) / lambda),
              epaisseur_cm:   String(ep_cm),
              prix_unit:      parseFloat(m.prix) || 0,
              gwp100_unit:    extractImpact(m.impacts, "gwp100", "gwp_100") || 0,
              impacts:        m.impacts || {},
              dvr_materiau:   m.dvr_materiau ?? co.dvr_materiau ?? null,
              flux_reference: m.flux_reference ?? co.flux_reference ?? null,
              efficacite:     100,
            });
          }
        }
        if (import.meta.env.DEV && candidates.length > 0) {
          console.log(`Variation épaisseur [${co.material_name}] : ${candidates.length} candidats générés`);
        }
      } else {
        // ── Non-isolants : 1 candidat par matériau (logique inchangée) ─────────
        candidates = altMats.map(m => {
          const m_r = parseFloat(m.valeur_r);
          const r_from_lib = isFinite(m_r) && m_r > 0 ? m_r : null;
          const isStatuQuo = m.id === co.material_id;
          const r_local_value = isStatuQuo
            ? (co.r_local || (r_from_lib != null ? String(r_from_lib) : ""))
            : (r_from_lib != null ? String(r_from_lib) : (co.r_local || ""));
          return {
            ...co,
            material_id:    m.id,
            material_name:  m.name,
            lambda_lib:     parseFloat(m.valeur_r) ?? null,
            r_local:        r_local_value,
            lambda_local:   "",
            prix_unit:      parseFloat(m.prix) || 0,
            gwp100_unit:    extractImpact(m.impacts, "gwp100", "gwp_100") || 0,
            impacts:        m.impacts || {},
            dvr_materiau:   m.dvr_materiau ?? co.dvr_materiau ?? null,
            flux_reference: m.flux_reference ?? co.flux_reference ?? null,
            poids_unite:    m.poids_unite ?? co.poids_unite ?? null,
            efficacite:     100,
          };
        });
      }

      if (candidates.length > 0) {
        slots.push({ paroiId: paroi.id, compId: co.id, type: "opaque", candidates, originalId: co.material_id, originalEp, sOpaque: sOpaqueParoi });
      }
    }

    for (const bv of paroi.baiesVitrees) {
      if (bv.is_fixed) continue;
      const bvQuantite = parseFloat(bv.quantite) || 1;
      const bvVitId   = bv.material_id ?? bv.vitrage_id;
      const bvVitName = bv.vitrage_name ?? bv.material_name;

      // ── Slot vitrage ──────────────────────────────────────────────────────────
      let allFenMats = materials
        .filter(m => isFenetreCategory(m.category || "Autre"))
        .sort((a, b) => (parseFloat(a.prix) || 0) - (parseFloat(b.prix) || 0));

      const hadVitAlternatives = allFenMats.some(m => m.id !== bvVitId);

      // Filtre de non-dégradation thermique vitrage
      const bvRLocal = parseFloat(bv.r_vitrage_local) > 0 ? parseFloat(bv.r_vitrage_local)
        : parseFloat(bv.r_local);
      const bvR = (isFinite(bvRLocal) && bvRLocal > 0) ? bvRLocal
        : (parseFloat(bv.valeur_r_vitrage) || parseFloat(bv.valeur_r) || 0);
      const bvEff = (parseFloat(bv.efficacite) || 100) / 100;
      const bvREff = (isFinite(bvR) && bvR > 0) ? bvR * bvEff : null;
      if (bvREff != null && bvREff > 0) {
        allFenMats = allFenMats.filter(m => {
          if (m.id === bvVitId) return true;
          const r = parseFloat(m.valeur_r);
          return isFinite(r) && r > 0 && r >= bvREff;
        });
        if (hadVitAlternatives && !allFenMats.some(m => m.id !== bvVitId)) {
          fixedDueToConstraint.push({ compName: bvVitName, paroiNom: paroi.nom });
        }
      }

      let vitAltMats = allFenMats.slice(0, PER_SLOT);
      if (!vitAltMats.find(m => m.id === bvVitId)) {
        const curVit = materials.find(m => m.id === bvVitId);
        if (curVit) vitAltMats = [curVit, ...vitAltMats].slice(0, PER_SLOT);
      }

      const vitageCandidates = vitAltMats.map(m => ({
        material_id:           m.id,
        material_name:         m.name,
        valeur_r_vitrage:      parseFloat(m.valeur_r) || 0,
        impacts:               m.impacts || {},
        dvr_materiau_vitrage:  m.dvr_materiau ?? bv.dvr_materiau_vitrage ?? null,
        poids_unite_vitrage:   m.poids_unite ?? bv.poids_unite_vitrage ?? null,
        prix_unit:             parseFloat(m.prix) || 0,
      }));

      if (vitageCandidates.length > 0) {
        slots.push({ paroiId: paroi.id, compId: bv.id, type: "vitree_vitrage", candidates: vitageCandidates, originalId: bv.material_id, bvQuantite, sVitrageUnit: parseFloat(bv.s_vitrage_unit) || 0 });
      }

      // ── Slot cadre (seulement si le BV a déjà un cadre) ───────────────────────
      if (bv.cadre_id) {
        let cadreMats = materials
          .filter(m => (m.category || "").toLowerCase() === "cadre")
          .sort((a, b) => (parseFloat(a.prix) || 0) - (parseFloat(b.prix) || 0));

        // Filtre de non-dégradation thermique cadre
        const bvRCadre = parseFloat(bv.r_cadre_local) > 0
          ? parseFloat(bv.r_cadre_local)
          : parseFloat(bv.valeur_r_cadre);
        if (isFinite(bvRCadre) && bvRCadre > 0) {
          cadreMats = cadreMats.filter(m => {
            if (m.id === bv.cadre_id) return true;
            const r = parseFloat(m.valeur_r);
            return isFinite(r) && r > 0 && r >= bvRCadre;
          });
        }

        let cadreAltMats = cadreMats.slice(0, PER_SLOT);
        if (!cadreAltMats.find(m => m.id === bv.cadre_id)) {
          const curCad = materials.find(m => m.id === bv.cadre_id);
          if (curCad) cadreAltMats = [curCad, ...cadreAltMats].slice(0, PER_SLOT);
        }

        const cadreCandidates = cadreAltMats.map(m => ({
          material_id:         m.id,
          material_name:       m.name,
          valeur_r_cadre:      parseFloat(m.valeur_r) || null,
          dvr_materiau_cadre:  m.dvr_materiau ?? bv.dvr_materiau_cadre ?? null,
          poids_unite_cadre:   m.poids_unite ?? bv.poids_unite_cadre ?? null,
          impacts_cadre:       m.impacts || {},
          prix_unit:           parseFloat(m.prix) || 0,
        }));

        if (cadreCandidates.length > 0) {
          slots.push({ paroiId: paroi.id, compId: bv.id, type: "vitree_cadre", candidates: cadreCandidates, originalId: bv.cadre_id, bvQuantite, sCadreUnit: parseFloat(bv.s_cadre_unit) || 0 });
        }
      }
    }

    // ── Ajout d'isolant sur parois extérieures sans isolant ──────────────────
    // LIMITATION : l'ajout d'isolant peut faire exploser l'espace combinatoire.
    // Sur un bâtiment avec N parois éligibles et K candidats par paroi (K ≈ 10
    // typiquement avec 3 isolants × 3 paliers + no-op), l'espace augmente d'un
    // facteur K^N. Le SAFETY_CAP à 50 000 et la stratégie 3-listes gèrent ce cas,
    // mais l'auditeur peut perdre en diversité. Recommandation : réduire epIsoMax
    // ou marquer certaines parois comme "Fixe" si nécessaire.
    if (isParoiEligibleAjoutIsolant(paroi)) {
      const isoMats = materials.filter(m => isIsolantCategory(m.category) && m.flux_reference > 0);
      const addedCandidates = [];
      for (const m of isoMats) {
        const lambda = getLambda(m);
        if (!isFinite(lambda) || lambda <= 0) continue;
        const epMin = EP_ISO_STEP;
        const epMax = epIsoMax;
        if (epMin > epMax) continue;
        const epMid = Math.round(((epMin + epMax) / 2) / EP_ISO_STEP) * EP_ISO_STEP;
        const paliers = [...new Set([epMin, epMid, epMax].map(ep => Math.round(ep * 100) / 100))]
          .filter(ep => ep <= epMax + 0.01);
        for (const ep_cm of paliers) {
          addedCandidates.push({
            material_id:    m.id,
            material_name:  m.name,
            category:       "Isolant",
            r_cible:        String((ep_cm / 100) / lambda),
            epaisseur_cm:   String(ep_cm),
            surface_m2:     paroi.surface_totale,
            efficacite:     100,
            flux_reference: m.flux_reference,
            dvr_materiau:   m.dvr_materiau ?? null,
            impacts:        m.impacts || {},
            prix_unit:      parseFloat(m.prix) || 0,
            lambda_lib:     lambda,
            r_local:        "",
            lambda_local:   "",
            is_added:       true,
          });
        }
      }
      addedCandidates.push({ material_id: null, material_name: "Pas d'ajout", is_added: true, is_noop: true, r_cible: null, epaisseur_cm: null, surface_m2: 0, prix_unit: 0 });
      if (addedCandidates.filter(c => !c.is_noop).length > 0) {
        slots.push({
          paroiId:    paroi.id,
          compId:     `${paroi.id}__ADDED_ISOLANT`,
          type:       "opaque",
          isAdded:    true,
          originalId: null,
          originalEp: null,
          candidates: addedCandidates,
          sOpaque:    sOpaqueParoi,
        });
        if (import.meta.env.DEV) {
          console.log(`Paroi éligible ajout isolant : ${paroi.nom || paroi.id} — ${addedCandidates.length - 1} candidats`);
        }
      }
    }
  }

  if (slots.length === 0) return [];

  function applyChoice(b, slot, cand) {
    if (slot.isAdded) {
      if (cand.is_noop) return b;
      return {
        ...b,
        parois: b.parois.map(p => {
          if (p.id !== slot.paroiId) return p;
          return {
            ...p,
            composantsOpaques: [
              ...p.composantsOpaques,
              {
                id:             newId(),
                material_id:    cand.material_id,
                material_name:  cand.material_name,
                category:       "Isolant",
                r_cible:        cand.r_cible,
                epaisseur_cm:   cand.epaisseur_cm,
                surface_m2:     cand.surface_m2,
                efficacite:     100,
                flux_reference: cand.flux_reference,
                dvr_materiau:   cand.dvr_materiau,
                impacts:        cand.impacts,
                prix_unit:      cand.prix_unit,
                lambda_lib:     cand.lambda_lib,
                r_local:        "",
                lambda_local:   "",
                is_added_by_optimisation: true,
              },
            ],
          };
        }),
      };
    }
    return {
      ...b,
      parois: b.parois.map(p => {
        if (p.id !== slot.paroiId) return p;
        if (slot.type === "opaque") {
          return { ...p, composantsOpaques: p.composantsOpaques.map(c => c.id === slot.compId ? cand : c) };
        } else if (slot.type === "vitree_vitrage") {
          return { ...p, baiesVitrees: p.baiesVitrees.map(bv => bv.id !== slot.compId ? bv : {
            ...bv,
            material_id:          cand.material_id,
            material_name:        cand.material_name,
            valeur_r_vitrage:     cand.valeur_r_vitrage,
            impacts:              cand.impacts,
            dvr_materiau_vitrage: cand.dvr_materiau_vitrage,
            prix_unit_vitrage:    cand.prix_unit,
            gwp100_unit_vitrage:  extractImpact(cand.impacts, "gwp100", "gwp_100") ?? null,
          })};
        } else { // vitree_cadre
          return { ...p, baiesVitrees: p.baiesVitrees.map(bv => bv.id !== slot.compId ? bv : {
            ...bv,
            cadre_id:            cand.material_id,
            cadre_name:          cand.material_name,
            valeur_r_cadre:      cand.valeur_r_cadre,
            dvr_materiau_cadre:  cand.dvr_materiau_cadre,
            impacts_cadre:       cand.impacts_cadre,
            prix_unit_cadre:     cand.prix_unit,
          })};
        }
      }),
    };
  }

  const allCombos = [];

  function enumerate(idx, curBat, choices, accRenovCost) {
    if (allCombos.length >= SAFETY_CAP) return;
    if (idx === slots.length) {
      const st = calcBatimentStats(curBat);
      allCombos.push({
        cost:           st.total_cout    ?? 0,
        renovation_cost: accRenovCost,
        gwp:            st.total_gwp     ?? 0,
        gwp_amorti:     st.gwp_amorti    ?? 0,
        energy_amorti:  st.energy_amorti ?? 0,
        sante_amorti:   st.sante_amorti  ?? 0,
        energy_kwh:     st.energy_kwh    ?? null,
        dep_wk:         st.dep_wk        ?? null,
        choices,
        paroi_u_moyens: curBat.parois.map(p => calcParoiStats(p)?.u_moyen ?? null),
      });
      return;
    }
    const slot = slots[idx];
    for (const cand of slot.candidates) {
      const qty = slot.type === "opaque"
        ? (() => {
            const s = slot.sOpaque ?? 0;
            if (isIsolantCategory(cand.category)) {
              const rc = parseFloat(cand.r_cible);
              const fr = parseFloat(cand.flux_reference);
              return (isFinite(rc) && rc > 0 && isFinite(fr) && fr > 0) ? rc * fr * s : 0;
            }
            return s;
          })()
        : (slot.bvQuantite ?? 1);
      const renovQty = slot.type === "vitree_vitrage" ? (slot.sVitrageUnit ?? 0) * (slot.bvQuantite ?? 1)
        : slot.type === "vitree_cadre"                ? (slot.sCadreUnit   ?? 0) * (slot.bvQuantite ?? 1)
        : qty;
      const isChanged = cand.material_id !== slot.originalId;
      enumerate(
        idx + 1,
        applyChoice(curBat, slot, cand),
        [...choices, {
          paroiId: slot.paroiId, compId: slot.compId, type: slot.type,
          material_id: cand.material_id, material_name: cand.material_name,
          prix_unit: cand.prix_unit,
          epaisseur_cm: slot.type === "opaque" ? (cand.epaisseur_cm ?? null) : null,
          r_cible:      slot.type === "opaque" ? (cand.r_cible      ?? null) : null,
          isAdded:      !!(slot.isAdded),
          is_noop:      !!(cand.is_noop),
        }],
        accRenovCost + (isChanged ? (cand.prix_unit || 0) * renovQty : 0),
      );
    }
  }

  enumerate(0, bat, [], 0);

  // ── Stratégie 3 listes — évite le biais de sélection sur critère unique ──────
  const makeKey = (combo) => makeComboKey(combo.choices);

  let finalCombos;
  if (allCombos.length <= 2000) {
    finalCombos = allCombos;
  } else {
    const sqEnergy = calcBatimentStats(bat).energy_kwh;
    const listA = [...allCombos].sort((a, b) => a.cost !== b.cost ? a.cost - b.cost : a.gwp - b.gwp).slice(0, 500);
    const listB = [...allCombos].sort((a, b) => a.gwp  !== b.gwp  ? a.gwp  - b.gwp  : a.cost - b.cost).slice(0, 500);
    const listC = [...allCombos]
      .filter(c => c.energy_kwh != null && sqEnergy != null)
      .sort((a, b) => {
        const d = (sqEnergy - b.energy_kwh) - (sqEnergy - a.energy_kwh);
        return d !== 0 ? d : a.cost - b.cost;
      }).slice(0, 500);
    const seen = new Set();
    finalCombos = [];
    for (const c of [...listA, ...listB, ...listC]) {
      const k = makeKey(c);
      if (!seen.has(k)) { seen.add(k); finalCombos.push(c); }
    }
    console.log(`Optimisation 3-listes: A=${listA.length} B=${listB.length} C=${listC.length} doublons=${listA.length + listB.length + listC.length - finalCombos.length} final=${finalCombos.length}`);
  }

  // Forcer le statu quo en position 0
  const sqKey = slots
    .slice().sort((a, b) => (a.compId + a.type).localeCompare(b.compId + b.type))
    .map(s => `${s.compId}:${s.type}:${s.originalId}${s.originalEp != null ? `:e${s.originalEp}` : ""}`)
    .join("|");
  const sqIdx = finalCombos.findIndex(c => makeKey(c) === sqKey);
  if (sqIdx > 0) { const [sq] = finalCombos.splice(sqIdx, 1); finalCombos.unshift(sq); }

  return { combos: finalCombos, fixedDueToConstraint };
}

function computePhares(combos, bat, materials, prixKwhOverride) {
  const sqSt        = calcBatimentStats(bat);
  const isRenovation = bat.type_batiment === "renovation";
  const sqCost      = isRenovation ? 0 : (sqSt.total_cout    ?? 0);
  const sqGwp       = sqSt.total_gwp    ?? 0;
  const sqEnergy    = sqSt.energy_kwh   ?? null;
  const sqGwpAmorti = sqSt.gwp_amorti   ?? 0;
  const sqEnAmorti  = sqSt.energy_amorti ?? 0;
  const sqSaAmorti  = sqSt.sante_amorti  ?? 0;

  const statuQuo = {
    cost: sqCost, renovation_cost: 0, gwp: sqGwp,
    gwp_amorti: sqGwpAmorti, energy_amorti: sqEnAmorti, sante_amorti: sqSaAmorti,
    energy_kwh: sqEnergy, choices: [],
  };

  if (combos.length === 0) {
    return { statuQuo, economique: null, ecologique: null, roi: null, topsis2: null };
  }

  // Prix €/kWh dynamique selon le moyen de chauffage du bâtiment
  const PRICE   = prixKwhOverride ?? PRIX_KWH_BY_CHAUFFAGE[bat.moyen_chauffage] ?? 0.20;
  const HORIZON = 20;

  let economique;
  if (isRenovation) {
    const withRenov = combos.filter(c => c.renovation_cost > 0);
    economique = withRenov.length > 0
      ? withRenov.reduce((a, b) => a.renovation_cost < b.renovation_cost ? a : b)
      : combos[0];
  } else {
    economique = [...combos].sort((a, b) => a.cost - b.cost)[0];
  }

  // Profil Écologique : minimise score_eco = GWP_amorti + CO₂_exploitation × DVR_bâtiment
  const dvrBat    = bat.dvr_batiment ?? 60;
  const ecoCh     = CHAUFFAGE_OPTIONS.find(o => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const co2Factor = ecoCh.co2;
  const ecoCandidates = combos.filter(c => c.energy_kwh != null);
  let ecologique;
  if (ecoCandidates.length === 0) {
    ecologique = [...combos].sort((a, b) => (a.gwp_amorti ?? 0) - (b.gwp_amorti ?? 0))[0] ?? null;
  } else {
    ecologique = ecoCandidates.reduce((best, c) => {
      const sC = (c.gwp_amorti    ?? 0) + c.energy_kwh * co2Factor * dvrBat;
      const sB = (best.gwp_amorti ?? 0) + best.energy_kwh * co2Factor * dvrBat;
      return sC < sB ? c : best;
    });
    // Garde-fou : si GWP construction amorti > statu quo → fallback minimum GWP amorti
    if (sqGwpAmorti > 0 && (ecologique.gwp_amorti ?? 0) > sqGwpAmorti) {
      ecologique = [...combos].sort((a, b) => (a.gwp_amorti ?? 0) - (b.gwp_amorti ?? 0))[0];
    }
  }

  let roi = null;
  if (sqEnergy != null) {
    const renovCands = isRenovation
      ? combos.filter(c => c.renovation_cost > 0 && c.energy_kwh != null && (sqEnergy - c.energy_kwh) > 0)
      : combos.filter(c => c.cost > sqCost && c.energy_kwh != null);
    if (renovCands.length > 0) {
      roi = renovCands.reduce((best, c) => {
        const invest  = isRenovation ? c.renovation_cost    : (c.cost - sqCost);
        const investB = isRenovation ? best.renovation_cost : (best.cost - sqCost);
        const r = (sqEnergy - c.energy_kwh)    * PRICE * HORIZON / invest;
        const b = (sqEnergy - best.energy_kwh) * PRICE * HORIZON / investB;
        return r > b ? c : best;
      });
    }
  }

  // ── Helpers TOPSIS communs ────────────────────────────────────────────────────
  const valid = combos.filter(c => c.energy_kwh != null);
  const eucNorm = arr => Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  const normVec = (arr, w) => { const n = eucNorm(arr); return n === 0 ? arr.map(() => 0) : arr.map(v => (v / n) * w); };

  // 5 critères TOPSIS (poids : coût=1, savings=1, GWP=1, énergie NR=0,5, santé=0,5) — sensibilité sans bonus :
  // Coût différentiel — minimiser | Économies €/an — maximiser
  // GWP amorti — minimiser | Énergie NR amortie — minimiser (0,5) | Santé amortie — minimiser (0,5)
  function buildTopsisVectors() {
    const rawCout  = valid.map(c => isRenovation ? (c.renovation_cost ?? 0) : (c.cost - sqCost));
    const rawSav   = valid.map(c => sqEnergy != null ? (sqEnergy - c.energy_kwh) * PRICE : 0);
    const rawGwpAm = valid.map(c => c.gwp_amorti    ?? 0);
    const rawEnAm  = valid.map(c => c.energy_amorti ?? 0);
    const rawSaAm  = valid.map(c => c.sante_amorti  ?? 0);
    const vCout  = normVec(rawCout,  1.0);
    const vSav   = normVec(rawSav,   1.0);
    const vGwpAm = normVec(rawGwpAm, 1.0);
    const vEnAm  = normVec(rawEnAm,  0.5);
    const vSaAm  = normVec(rawSaAm,  0.5);
    // Idéaux : coût diff → min ; économies → max ; GWP/Énergie/Santé amortis → min
    const aP_cout  = Math.min(...vCout);  const aM_cout  = Math.max(...vCout);
    const aP_sav   = Math.max(...vSav);   const aM_sav   = Math.min(...vSav);
    const aP_gwpAm = Math.min(...vGwpAm); const aM_gwpAm = Math.max(...vGwpAm);
    const aP_enAm  = Math.min(...vEnAm);  const aM_enAm  = Math.max(...vEnAm);
    const aP_saAm  = Math.min(...vSaAm);  const aM_saAm  = Math.max(...vSaAm);
    return { vCout, vSav, vGwpAm, vEnAm, vSaAm, aP_cout, aM_cout, aP_sav, aM_sav, aP_gwpAm, aM_gwpAm, aP_enAm, aM_enAm, aP_saAm, aM_saAm };
  }

  function topsisScore(v, i) {
    const { vCout, vSav, vGwpAm, vEnAm, vSaAm, aP_cout, aM_cout, aP_sav, aM_sav, aP_gwpAm, aM_gwpAm, aP_enAm, aM_enAm, aP_saAm, aM_saAm } = v;
    const dI = Math.sqrt(
      (vCout[i]  - aP_cout) **2 + (vSav[i]   - aP_sav)  **2 +
      (vGwpAm[i] - aP_gwpAm)**2 + (vEnAm[i]  - aP_enAm) **2 + (vSaAm[i] - aP_saAm)**2
    );
    const dA = Math.sqrt(
      (vCout[i]  - aM_cout) **2 + (vSav[i]   - aM_sav)  **2 +
      (vGwpAm[i] - aM_gwpAm)**2 + (vEnAm[i]  - aM_enAm) **2 + (vSaAm[i] - aM_saAm)**2
    );
    return (dI + dA) > 0 ? dA / (dI + dA) : 0;
  }

  // TOPSIS 2.0 — bonus raffiné : Δcoût ≤ 0 → Infinity ; ΔGWP ≤ 0 → 0 ; P75 sur finies positives
  let topsis2 = null;
  if (valid.length > 1) {
    const v = buildTopsisVectors();
    const scored2 = valid.map((c, i) => ({ c, score: topsisScore(v, i) }));
    const efficiencies2 = scored2.map(({ c }) => {
      const deltaGwp  = sqGwpAmorti - (c.gwp_amorti ?? 0);
      const deltaCost = isRenovation ? (c.renovation_cost ?? 0) : (c.cost - sqCost);
      if (deltaCost <= 0) return Infinity;
      if (deltaGwp  <= 0) return 0;
      return deltaGwp / deltaCost;
    });
    const finitePos2 = efficiencies2.filter(e => isFinite(e) && e > 0).sort((a, b) => a - b);
    const p75_2 = finitePos2.length > 0 ? finitePos2[Math.floor((finitePos2.length - 1) * 0.75)] : 0;
    const finalScored2 = scored2.map((item, i) => ({ ...item, score: efficiencies2[i] > p75_2 ? item.score * 1.15 : item.score }));
    finalScored2.sort((a, b) => b.score - a.score);
    topsis2 = finalScored2[0].c;
  } else if (valid.length === 1) {
    topsis2 = valid[0];
  }

  return { statuQuo, economique, ecologique, roi, topsis2 };
}

// R_eff = R_theorique × (eff/100) → U_eff = U_th / (eff/100), dégradation réelle
function getComposantREffectif(comp) {
  const r = getComposantR(comp);
  if (r == null) return null;
  const eff = (parseFloat(comp.efficacite) || 100) / 100;
  return r * eff;
}

// ─── ACV 2.0 helpers ──────────────────────────────────────────────────────────

function calcComposantACV(co, dvr_batiment, s_opaque = 0) {
  const dvr_bat = parseFloat(dvr_batiment) || 60;
  const dvr_mat = parseFloat(co.dvr_materiau);
  if (!isFinite(dvr_mat) || dvr_mat <= 0)
    return { valid: false, errorMsg: "DVR matériau manquante — calcul ACV impossible" };
  const nb_cycles = Math.ceil(dvr_bat / dvr_mat);
  const surface = s_opaque;
  let qty;
  let masse_kg = null;
  if (isIsolantCategory(co.category)) {
    const r_cible = parseFloat(co.r_cible);
    if (!isFinite(r_cible) || r_cible <= 0)
      return { valid: false, errorMsg: "R cible non défini — calcul ACV impossible" };
    const flux_ref = parseFloat(co.flux_reference);
    if (!isFinite(flux_ref) || flux_ref <= 0)
      return { valid: false, errorMsg: "Flux de référence manquant — calcul ACV impossible" };
    qty = r_cible * flux_ref * surface; // kg (flux_ref en kg/(m²·K/W))
    masse_kg = qty;
  } else {
    qty = surface;
    const pu = parseFloat(co.poids_unite);
    if (isFinite(pu) && pu > 0) masse_kg = pu * surface; // kg/m² × m² = kg
  }
  const gwp    = extractImpact(co.impacts, "gwp100", "gwp_100") ?? 0;
  const energy = extractImpact(co.impacts, "energy_nonrenewable_adp", "energy_nonrenewable", "energy_nr", "penrt") ?? 0;
  const sante  = extractImpact(co.impacts, "photochemical_oxidant_hh", "photochemical_oxidant") ?? 0;
  const decon_valid = masse_kg !== null;
  const m = masse_kg ?? 0;
  return {
    valid: true, errorMsg: null, qty, nb_cycles, decon_valid,
    gwp_brut:      gwp    * qty,
    gwp_amorti:    gwp    * qty * nb_cycles + m * DECON_IMPACTS_PER_KG.gwp100    * nb_cycles,
    energy_brut:   energy * qty,
    energy_amorti: energy * qty * nb_cycles + m * DECON_IMPACTS_PER_KG.energy_nr * nb_cycles,
    sante_brut:    sante  * qty,
    sante_amorti:  sante  * qty * nb_cycles + m * DECON_IMPACTS_PER_KG.sante     * nb_cycles,
  };
}

function calcBVImpactACV(bv, dvr_batiment) {
  const dvr_bat = parseFloat(dvr_batiment) || 60;
  const qty = parseFloat(bv.quantite) || 1;
  const sv = (parseFloat(bv.s_vitrage_unit) || 0) * qty;  // m² total vitrage
  const res = {
    valid: true, decon_valid: true, errors: [], errorMsg: null,
    gwp_brut: 0, gwp_amorti: 0, energy_brut: 0, energy_amorti: 0, sante_brut: 0, sante_amorti: 0,
  };

  const dvr_v = parseFloat(bv.dvr_materiau_vitrage);
  const nc_v  = (isFinite(dvr_v) && dvr_v > 0) ? Math.ceil(dvr_bat / dvr_v) : null;
  if (nc_v === null) { res.valid = false; res.errors.push("DVR vitrage manquante"); }
  const gwp_v    = parseFloat(bv.gwp100_unit_vitrage) || extractImpact(bv.impacts, "gwp100", "gwp_100") || 0;
  const energy_v = extractImpact(bv.impacts, "energy_nonrenewable_adp", "energy_nonrenewable", "energy_nr", "penrt") ?? 0;
  const sante_v  = extractImpact(bv.impacts, "photochemical_oxidant_hh", "photochemical_oxidant") ?? 0;
  res.gwp_brut    += gwp_v    * sv;    res.gwp_amorti    += gwp_v    * sv * (nc_v ?? 1);
  res.energy_brut += energy_v * sv;    res.energy_amorti += energy_v * sv * (nc_v ?? 1);
  res.sante_brut  += sante_v  * sv;    res.sante_amorti  += sante_v  * sv * (nc_v ?? 1);

  const pu_v = parseFloat(bv.poids_unite_vitrage);
  if (isFinite(pu_v) && pu_v > 0) {
    const m_v = pu_v * sv;  // kg/m² × m² = kg
    res.gwp_amorti    += m_v * DECON_IMPACTS_PER_KG.gwp100    * (nc_v ?? 1);
    res.energy_amorti += m_v * DECON_IMPACTS_PER_KG.energy_nr * (nc_v ?? 1);
    res.sante_amorti  += m_v * DECON_IMPACTS_PER_KG.sante     * (nc_v ?? 1);
  } else {
    res.decon_valid = false;
  }

  if (bv.cadre_id) {
    const sc = (parseFloat(bv.s_cadre_unit) || 0) * qty;  // m² total cadre
    const dvr_c = parseFloat(bv.dvr_materiau_cadre);
    const nc_c  = (isFinite(dvr_c) && dvr_c > 0) ? Math.ceil(dvr_bat / dvr_c) : null;
    if (nc_c === null) { res.valid = false; res.errors.push("DVR cadre manquante"); }
    const impC = bv.impacts_cadre || {};
    const gwp_c    = extractImpact(impC, "gwp100", "gwp_100") ?? 0;
    const energy_c = extractImpact(impC, "energy_nonrenewable_adp", "energy_nonrenewable", "energy_nr", "penrt") ?? 0;
    const sante_c  = extractImpact(impC, "photochemical_oxidant_hh", "photochemical_oxidant") ?? 0;
    res.gwp_brut    += gwp_c * sc;     res.gwp_amorti    += gwp_c    * sc * (nc_c ?? 1);
    res.energy_brut += energy_c * sc;  res.energy_amorti += energy_c * sc * (nc_c ?? 1);
    res.sante_brut  += sante_c * sc;   res.sante_amorti  += sante_c  * sc * (nc_c ?? 1);

    const pu_c = parseFloat(bv.poids_unite_cadre);
    if (isFinite(pu_c) && pu_c > 0) {
      const m_c = pu_c * sc;  // kg/m² × m² = kg
      res.gwp_amorti    += m_c * DECON_IMPACTS_PER_KG.gwp100    * (nc_c ?? 1);
      res.energy_amorti += m_c * DECON_IMPACTS_PER_KG.energy_nr * (nc_c ?? 1);
      res.sante_amorti  += m_c * DECON_IMPACTS_PER_KG.sante     * (nc_c ?? 1);
    } else {
      res.decon_valid = false;
    }
  }
  if (!res.valid) res.errorMsg = res.errors.join(", ") + " — amortissement approx. (nc=1)";
  return res;
}

function getRSuperficiel(type) {
  switch ((type || "").toLowerCase()) {
    case "toiture":  return 0.14; // Rsi=0.10 + Rse=0.04 flux ascendant (EN ISO 6946)
    case "plancher": return 0.21; // Rsi=0.17 + Rse=0.04 flux descendant
    case "cloison":  return 0.26; // Rsi=0.13 + Rsi=0.13 paroi intérieure
    default:         return 0.17; // Rsi=0.13 + Rse=0.04 flux horizontal (mur, fallback)
  }
}

function calcParoiStats(paroi, dvr_batiment = 60) {
  const S_tot = parseFloat(paroi.surface_totale);
  if (!isFinite(S_tot) || S_tot <= 0) return null;

  let s_vitree = 0;
  let ua_vitree = 0;
  let cout_vitree = 0;
  let gwp_brut = 0, gwp_amorti = 0;
  let energy_brut = 0, energy_amorti = 0;
  let sante_brut = 0, sante_amorti = 0;
  const acv_errors = [];

  for (const bv of paroi.baiesVitrees) {
    const qty = parseFloat(bv.quantite) || 1;
    const sv = Math.max(0, parseFloat(bv.s_vitrage_unit) || 0) * qty;
    const sc = Math.max(0, parseFloat(bv.s_cadre_unit) || 0) * qty;
    const sTot = sv + sc;
    const rV = parseFloat(bv.r_vitrage_local) > 0 ? parseFloat(bv.r_vitrage_local) : parseFloat(bv.valeur_r_vitrage);
    const rC = parseFloat(bv.r_cadre_local) > 0 ? parseFloat(bv.r_cadre_local) : parseFloat(bv.valeur_r_cadre);
    const legacyR = parseFloat(bv.r_local) > 0 ? parseFloat(bv.r_local) : parseFloat(bv.valeur_r);
    let rFen;
    if (isFinite(rV) && rV > 0 && sTot > 0) {
      const uaV = sv > 0 ? sv / rV : 0;
      const uaC = (isFinite(rC) && rC > 0 && sc > 0) ? sc / rC : 0;
      rFen = sTot / (uaV + uaC);
    } else if (isFinite(legacyR) && legacyR > 0) {
      rFen = legacyR;
    }
    const bvEff = (parseFloat(bv.efficacite) || 100) / 100;
    const sCount = sTot > 0 ? sTot : (Math.max(0, parseFloat(bv.surface_par_unite) || 0) * qty);
    if (sCount > 0) {
      s_vitree += sCount;
      if (isFinite(rFen) && rFen > 0) ua_vitree += sCount * (1 / rFen) / bvEff;
    }
    const prixVitrage = parseFloat(bv.prix_unit_vitrage) || parseFloat(bv.prix_unit) || 0;
    const prixCadre   = bv.cadre_id ? (parseFloat(bv.prix_unit_cadre) || 0) : 0;
    cout_vitree += prixVitrage * sv + prixCadre * sc;

    const bvAcv = calcBVImpactACV(bv, dvr_batiment);
    gwp_brut    += bvAcv.gwp_brut;    gwp_amorti    += bvAcv.gwp_amorti;
    energy_brut += bvAcv.energy_brut; energy_amorti += bvAcv.energy_amorti;
    sante_brut  += bvAcv.sante_brut;  sante_amorti  += bvAcv.sante_amorti;
    if (!bvAcv.valid) acv_errors.push({ id: bv.id, name: bv.vitrage_name || "BV", errorMsg: bvAcv.errorMsg });
  }

  const s_opaque = Math.max(0, S_tot - s_vitree);

  let r_total = 0;
  let hasAllR = paroi.composantsOpaques.length > 0;
  let cout_opaque = 0;
  for (const co of paroi.composantsOpaques) {
    const r = getComposantREffectif(co);
    if (r == null) { hasAllR = false; } else { r_total += r; }
    const s = s_opaque;
    if (isIsolantCategory(co.category)) {
      const rc = parseFloat(co.r_cible);
      const fr = parseFloat(co.flux_reference);
      if (isFinite(rc) && rc > 0 && isFinite(fr) && fr > 0) {
        cout_opaque += (parseFloat(co.prix_unit) || 0) * rc * fr * s;
      }
    } else {
      cout_opaque += (parseFloat(co.prix_unit) || 0) * s;
    }

    const coAcv = calcComposantACV(co, dvr_batiment, s_opaque);
    gwp_brut    += coAcv.gwp_brut;    gwp_amorti    += coAcv.gwp_amorti;
    energy_brut += coAcv.energy_brut; energy_amorti += coAcv.energy_amorti;
    sante_brut  += coAcv.sante_brut;  sante_amorti  += coAcv.sante_amorti;
    if (!coAcv.valid) acv_errors.push({ id: co.id, name: co.material_name, errorMsg: coAcv.errorMsg });
  }

  const rSuperficiel = getRSuperficiel(paroi.type);
  const u_opaque = hasAllR ? 1 / (r_total + rSuperficiel) : null;
  const ua_opaque = u_opaque != null ? u_opaque * s_opaque : null;
  const ua_total = ua_opaque != null ? ua_opaque + ua_vitree : null;
  const u_moyen = ua_total != null ? ua_total / S_tot : null;
  const dep_wk = u_moyen != null ? u_moyen * S_tot : null;
  const cout = cout_opaque + cout_vitree;

  return {
    r_total: hasAllR && r_total > 0 ? r_total : null,
    u_opaque,
    u_moyen,
    dep_wk,
    s_vitree,
    s_opaque,
    S_tot,
    cout: cout > 0 ? cout : null,
    gwp: gwp_brut > 0 ? gwp_brut : null,  // compat optimiseur
    gwp_brut,    gwp_amorti,
    energy_brut, energy_amorti,
    sante_brut,  sante_amorti,
    acv_errors,
  };
}

function calcBatimentStats(bat) {
  const dj = parseFloat(bat.degres_jours) || 1950.7;
  const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const dvr_bat = bat.dvr_batiment ?? 60;

  let total_dep = 0;
  let allHaveDep = bat.parois.length > 0;
  let total_cout = 0;
  let gwp_brut = 0, gwp_amorti = 0;
  let energy_brut = 0, energy_amorti = 0;
  let sante_brut = 0, sante_amorti = 0;
  let acv_errors_count = 0;

  for (const p of bat.parois) {
    const s = calcParoiStats(p, dvr_bat);
    if (!s || s.dep_wk == null) { allHaveDep = false; }
    else { total_dep += s.dep_wk; }
    if (s?.cout) total_cout += s.cout;
    gwp_brut    += s?.gwp_brut    ?? 0;
    gwp_amorti  += s?.gwp_amorti  ?? 0;
    energy_brut += s?.energy_brut ?? 0;
    energy_amorti += s?.energy_amorti ?? 0;
    sante_brut  += s?.sante_brut  ?? 0;
    sante_amorti += s?.sante_amorti ?? 0;
    acv_errors_count += s?.acv_errors?.length ?? 0;
  }

  const dep_wk = allHaveDep ? total_dep : null;
  const energy_kwh = dep_wk != null ? (dep_wk * dj * 24) / 1000 / ch.rendement : null;
  const co2_exploitation = energy_kwh != null ? energy_kwh * ch.co2 : null;

  return {
    dep_wk,
    energy_kwh,
    co2_exploitation,
    total_cout: total_cout > 0 ? total_cout : null,
    total_gwp: gwp_brut > 0 ? gwp_brut : null,  // compat optimiseur
    gwp_brut, gwp_amorti,
    energy_brut, energy_amorti,
    sante_brut, sante_amorti,
    acv_errors_count,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectLCA2() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();
  useEffect(() => { setSelectedProjectId(projectId); }, [projectId]);

  const [project,         setProject]         = useState(null);
  const [error,           setError]           = useState("");
  const [batiments,       setBatiments]       = useState([]);
  const [selectedId,      setSelectedId]      = useState(null);
  const [materials,       setMaterials]       = useState([]);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [expandedParois,  setExpandedParois]  = useState(new Set());
  const [activeParoiTabs, setActiveParoiTabs] = useState({});
  const [paroiModal,      setParoiModal]      = useState(null);
  const [paroiForm,       setParoiForm]       = useState({ nom: "", surface_totale: "", type: "mur" });
  const [compModal,       setCompModal]       = useState(null);
  const [compForm,        setCompForm]        = useState({});
  const [bvModal,         setBvModal]         = useState(null); // { batId, paroiId }
  const [bvForm,          setBvForm]          = useState({ vitrage_id: "", cadre_id: "", quantite: "1", s_vitrage_unit: "", s_cadre_unit: "" });
  const [saveStatus,      setSaveStatus]      = useState("idle"); // "idle" | "saving" | "saved"
  const [auditKwh,        setAuditKwh]        = useState(null);   // kWh/an depuis l'audit, null si absent
  const [optBatId,        setOptBatId]        = useState(null);   // id du bâtiment dont le panneau optim est ouvert
  const [optCachedHash,   setOptCachedHash]   = useState(null);   // hash sauvegardé côté serveur
  const [optCachedResult, setOptCachedResult] = useState(null);   // cache sauvegardé côté serveur
  const [batModal,        setBatModal]        = useState(false);
  const [batForm,         setBatForm]         = useState({ nom: "", type_batiment: "neuf", age_batiment: "0" });
  const [editingBatId,    setEditingBatId]    = useState(null);
  const [editBatNom,      setEditBatNom]      = useState("");
  const [migrationModal,  setMigrationModal]  = useState(false);
  const [migrationForm,   setMigrationForm]   = useState({ age: "", dvr: "60" });
  const [pendingResync,   setPendingResync]   = useState(false);

  const saveTimerRef  = useRef(null);
  const skipNextSave  = useRef(false);  // bloque la sauvegarde lors de la réhydratation initiale
  const dataLoaded    = useRef(false);  // bloque la sauvegarde avant que le GET initial soit terminé

  useEffect(() => {
    apiFetch("/projects")
      .then((res) => res.ok ? res.json() : Promise.reject("Chargement échoué"))
      .then((list) => setProject(list.find((x) => x.id === projectId) || null))
      .catch((e) => setError(String(e)));
  }, [projectId]);

  // Chargement des bâtiments ACV depuis le backend
  useEffect(() => {
    dataLoaded.current = false;
    skipNextSave.current = false;
    apiFetch(`/projects/${projectId}/lca?version=v2`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        dataLoaded.current = true;
        if (Array.isArray(data.batiments) && data.batiments.length > 0) {
          skipNextSave.current = true;
          let migCount = 0;
          const normalized = data.batiments.map(b => ({
            ...b,
            parois: b.parois.map(p => ({
              ...p,
              baiesVitrees: p.baiesVitrees.map(bv => {
                if (bv.vitrage_id && !bv.material_id) {
                  migCount++;
                  return { ...bv, material_id: bv.vitrage_id, material_name: bv.vitrage_name };
                }
                if (bv.material_id && !bv.vitrage_id) {
                  migCount++;
                  return { ...bv, vitrage_id: bv.material_id, vitrage_name: bv.material_name };
                }
                return bv;
              }),
            })),
          }));
          if (migCount > 0) console.log(`Migration BV : ${migCount} baie${migCount > 1 ? "s vitrées harmonisées" : " vitrée harmonisée"}`);
          setBatiments(normalized);
          setPendingResync(true);
          if (normalized[0].age_batiment == null) {
            setMigrationModal(true);
          }
        }
        setOptCachedHash(data.optimisation_hash   ?? null);
        setOptCachedResult(data.optimisation_cache ?? null);
      })
      .catch(() => { dataLoaded.current = true; });
  }, [projectId]);

  // Re-synchronise les champs ACV manquants depuis la bibliothèque (bug #15)
  useEffect(() => {
    if (!pendingResync || !materialsLoaded) return;
    setPendingResync(false);
    const matById = Object.fromEntries(materials.map(m => [m.id, m]));
    setBatiments(prev => {
      let opaqueCount = 0, bvCount = 0;
      const updated = prev.map(b => ({
        ...b,
        parois: b.parois.map(p => ({
          ...p,
          composantsOpaques: p.composantsOpaques.map(co => {
            const mat = matById[co.material_id];
            if (!mat) return co;
            const patch = {};
            if (co.dvr_materiau == null && mat.dvr_materiau != null)
              patch.dvr_materiau = mat.dvr_materiau;
            if (co.flux_reference == null && mat.flux_reference != null)
              patch.flux_reference = mat.flux_reference;
            if (co.poids_unite == null && mat.poids_unite != null)
              patch.poids_unite = mat.poids_unite;
            const imp = co.impacts;
            if ((!imp || !Object.keys(imp).length || extractImpact(imp, "gwp100", "gwp_100") == null) && mat.impacts)
              patch.impacts = mat.impacts;
            if (!Object.keys(patch).length) return co;
            opaqueCount++;
            return { ...co, ...patch };
          }),
          baiesVitrees: p.baiesVitrees.map(bv => {
            const patch = {};
            const vitId = bv.vitrage_id ?? bv.material_id;
            const vitMat = vitId ? matById[vitId] : null;
            if (vitMat) {
              if (bv.dvr_materiau_vitrage == null && vitMat.dvr_materiau != null)
                patch.dvr_materiau_vitrage = vitMat.dvr_materiau;
              if (bv.poids_unite_vitrage == null && vitMat.poids_unite != null)
                patch.poids_unite_vitrage = vitMat.poids_unite;
              const imp = bv.impacts;
              if ((!imp || !Object.keys(imp).length) && vitMat.impacts)
                patch.impacts = vitMat.impacts;
            }
            const cadMat = bv.cadre_id ? matById[bv.cadre_id] : null;
            if (cadMat) {
              if (bv.dvr_materiau_cadre == null && cadMat.dvr_materiau != null)
                patch.dvr_materiau_cadre = cadMat.dvr_materiau;
              if (bv.poids_unite_cadre == null && cadMat.poids_unite != null)
                patch.poids_unite_cadre = cadMat.poids_unite;
              const impC = bv.impacts_cadre;
              if ((!impC || !Object.keys(impC).length) && cadMat.impacts)
                patch.impacts_cadre = cadMat.impacts;
            }
            if (!Object.keys(patch).length) return bv;
            bvCount++;
            return { ...bv, ...patch };
          }),
        })),
      }));
      if (!opaqueCount && !bvCount) return prev;
      console.log(`Synchronisation bibliothèque : ${opaqueCount} composant${opaqueCount > 1 ? "s" : ""} opaque${opaqueCount > 1 ? "s" : ""} mis à jour, ${bvCount} baie${bvCount > 1 ? "s vitrées mises à jour" : " vitrée mise à jour"}`);
      return updated;
    });
  }, [pendingResync, materialsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch de la consommation audit (niveau projet, une seule fois)
  useEffect(() => {
    apiFetch(`/projects/${projectId}/audit/energie-chauffage`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => setAuditKwh(data.consommation_kwh_an ?? null))
      .catch(() => setAuditKwh(null));
  }, [projectId]);

  // Sauvegarde automatique debounce 800ms à chaque modification du state batiments
  useEffect(() => {
    if (!dataLoaded.current) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const res = await apiFetch(`/projects/${projectId}/lca/batiments?version=v2`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batiments,
            age_batiment: batiments[0]?.age_batiment ?? 0,
            dvr_batiment: batiments[0]?.dvr_batiment ?? 60,
          }),
        });
        if (res.ok) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus("idle");
        }
      } catch {
        setSaveStatus("idle");
      }
    }, 800);

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [batiments]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureMaterials() {
    if (materialsLoaded) return;
    try {
      const res = await apiFetch("/lca/materials");
      if (res.ok) {
        setMaterials(await res.json());
        setMaterialsLoaded(true);
      }
    } catch {}
  }

  // ── Building CRUD ──────────────────────────────────────────────────────────

  function openAddBatiment() {
    setBatForm({ nom: `Bâtiment ${batiments.length + 1}`, type_batiment: "neuf", age_batiment: "0" });
    setBatModal(true);
  }

  function confirmAddBatiment() {
    const age = parseInt(batForm.age_batiment, 10);
    setBatiments((prev) => [...prev, {
      id: newId(), nom: batForm.nom.trim() || `Bâtiment ${prev.length + 1}`,
      type_batiment: batForm.type_batiment || "neuf",
      age_batiment: isFinite(age) && age >= 0 ? age : 0,
      dvr_batiment: 60,
      surface_plancher: "", hauteur: "", temperature_interieure: 20,
      moyen_chauffage: "gaz", degres_jours: 1950.7, parois: [],
    }]);
    setBatModal(false);
  }

  function confirmMigration() {
    const age = parseInt(migrationForm.age, 10);
    const dvr = parseInt(migrationForm.dvr, 10) || 60;
    setBatiments((prev) => prev.map((b) =>
      b.age_batiment == null ? { ...b, age_batiment: age, dvr_batiment: dvr } : b
    ));
    setMigrationModal(false);
  }

  function updateBatiment(id, field, value) {
    setBatiments((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b));
  }

  function removeBatiment(id) {
    setBatiments((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function selectBatiment(id) {
    if (selectedId === id) { setSelectedId(null); return; }
    setSelectedId(id);
    ensureMaterials();
  }

  // ── Paroi CRUD ─────────────────────────────────────────────────────────────

  function openAddParoi(batId) {
    setParoiForm({ nom: "", surface_totale: "", type: "mur" });
    setParoiModal({ batId });
  }

  function confirmAddParoi() {
    if (!paroiModal) return;
    const p = {
      id: newId(), nom: paroiForm.nom || "Paroi",
      surface_totale: paroiForm.surface_totale, type: paroiForm.type,
      composantsOpaques: [], baiesVitrees: [],
    };
    setBatiments((prev) => prev.map((b) =>
      b.id === paroiModal.batId ? { ...b, parois: [...b.parois, p] } : b
    ));
    setParoiModal(null);
  }

  function updateParoi(batId, paroiId, field, value) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) => p.id === paroiId ? { ...p, [field]: value } : p),
      }
    ));
  }

  function removeParoi(batId, paroiId) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : { ...b, parois: b.parois.filter((p) => p.id !== paroiId) }
    ));
  }

  // ── Composant CRUD ─────────────────────────────────────────────────────────

  function openAddComposant(batId, paroiId, type) {
    if (type === "vitree") {
      setBvForm({ vitrage_id: "", cadre_id: "", quantite: "1", s_vitrage_unit: "", s_cadre_unit: "", r_vitrage_local: "", r_cadre_local: "" });
      setBvModal({ batId, paroiId });
    } else {
      setCompForm({ material_id: "", quantite: "1", epaisseur_cm: "", r_cible: "", surface_m2: "", surface_par_unite: "", lambda_custom: "", r_custom: "", unite_autre: "" });
      setCompModal({ batId, paroiId, type });
    }
  }

  function openReplaceOpaque(batId, paroiId, compId) {
    const comp = batiments.find(b => b.id === batId)
      ?.parois.find(p => p.id === paroiId)
      ?.composantsOpaques.find(c => c.id === compId);
    if (!comp) return;
    setCompForm({
      material_id: comp.material_id || "",
      epaisseur_cm: comp.epaisseur_cm || "",
      r_cible: comp.r_cible || "",
      surface_m2: comp.surface_m2 || "",
      lambda_custom: comp.lambda_local || "",
      r_custom: comp.r_local || "",
      quantite: "", surface_par_unite: "", unite_autre: comp.unite_autre || "",
    });
    setCompModal({ mode: "replace_opaque", batId, paroiId, compId, currentCat: comp.category });
  }
  function confirmReplaceOpaque(newMat) {
    if (!compModal) return;
    const { batId, paroiId, compId } = compModal;
    setBatiments(prev => prev.map(b =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map(p =>
          p.id !== paroiId ? p : {
            ...p, composantsOpaques: p.composantsOpaques.map(c => {
              if (c.id !== compId) return c;
              const sameCat = (c.category || "Autre") === (newMat.category || "Autre");
              return {
                ...c,
                material_id: newMat.id, material_name: newMat.name,
                category: newMat.category || "Autre",
                lambda_lib: parseFloat(newMat.valeur_r) ?? null,
                prix_unit: parseFloat(newMat.prix) || 0,
                gwp100_unit: extractImpact(newMat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
                impacts: newMat.impacts || {},
                dvr_materiau:   newMat.dvr_materiau ?? null,
                flux_reference: newMat.flux_reference ?? null,
                poids_unite:    newMat.poids_unite ?? null,
                lambda_local: sameCat ? c.lambda_local : "",
                r_local:      sameCat ? c.r_local      : "",
                r_cible:      sameCat ? c.r_cible      : "",
                epaisseur_cm: sameCat ? c.epaisseur_cm : "",
              };
            }),
          }
        ),
      }
    ));
    setCompModal(null);
  }

  function openReplaceVitrage(batId, paroiId, bvId) {
    setCompForm({ material_id: "", quantite: "", epaisseur_cm: "", r_cible: "", surface_m2: "", surface_par_unite: "", lambda_custom: "", r_custom: "", unite_autre: "" });
    setCompModal({ mode: "replace_vitrage", batId, paroiId, bvId });
  }
  function confirmReplaceVitrage(newMat) {
    if (!compModal) return;
    const { batId, paroiId, bvId } = compModal;
    setBatiments(prev => prev.map(b =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map(p =>
          p.id !== paroiId ? p : {
            ...p, baiesVitrees: p.baiesVitrees.map(bv =>
              bv.id !== bvId ? bv : {
                ...bv,
                vitrage_id: newMat.id, vitrage_name: newMat.name,
                material_id: newMat.id, material_name: newMat.name,
                valeur_r_vitrage: parseFloat(newMat.valeur_r) || null,
                prix_unit_vitrage: parseFloat(newMat.prix) || 0,
                gwp100_unit_vitrage: extractImpact(newMat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
                impacts: newMat.impacts || {},
                dvr_materiau_vitrage: newMat.dvr_materiau ?? null,
                poids_unite_vitrage:  newMat.poids_unite ?? null,
              }
            ),
          }
        ),
      }
    ));
    setCompModal(null);
  }

  function openReplaceCadre(batId, paroiId, bvId) {
    setCompForm({ material_id: "", quantite: "", epaisseur_cm: "", r_cible: "", surface_m2: "", surface_par_unite: "", lambda_custom: "", r_custom: "", unite_autre: "" });
    setCompModal({ mode: "replace_cadre", batId, paroiId, bvId });
  }
  function confirmReplaceCadre(newMat) {
    if (!compModal) return;
    const { batId, paroiId, bvId } = compModal;
    setBatiments(prev => prev.map(b =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map(p =>
          p.id !== paroiId ? p : {
            ...p, baiesVitrees: p.baiesVitrees.map(bv =>
              bv.id !== bvId ? bv : {
                ...bv,
                cadre_id: newMat.id, cadre_name: newMat.name,
                valeur_r_cadre: parseFloat(newMat.valeur_r) || null,
                dvr_materiau_cadre: newMat.dvr_materiau ?? null,
                poids_unite_cadre:  newMat.poids_unite ?? null,
                impacts_cadre: newMat.impacts ?? {},
                prix_unit_cadre: parseFloat(newMat.prix) || 0,
              }
            ),
          }
        ),
      }
    ));
    setCompModal(null);
  }

  function confirmAddComposant() {
    if (!compModal) return;
    const { batId, paroiId } = compModal;
    const mat = materials.find((m) => m.id === compForm.material_id);
    if (!mat) return;

    const cat = mat.category || "Autre";
    const isFenetre = isFenetreCategory(cat);

    if (isFenetre) {
      const rVal = parseFloat(compForm.r_custom) || parseFloat(mat.valeur_r) || 0;
      const bv = {
        id: newId(), material_id: mat.id, material_name: mat.name,
        valeur_r: rVal,
        r_custom: compForm.r_custom !== "" ? compForm.r_custom : "",
        quantite: parseFloat(compForm.quantite) || 1,
        surface_par_unite: compForm.surface_par_unite,
        is_fixed: false,
        efficacite: 100,
        prix_unit: parseFloat(mat.prix) || 0,
        gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
        impacts: mat.impacts || {},
        dvr_materiau_vitrage: mat.dvr_materiau ?? null,
        poids_unite_vitrage:  mat.poids_unite ?? null,
        impacts_cadre: {},
      };
      setBatiments((prev) => prev.map((b) =>
        b.id !== batId ? b : {
          ...b, parois: b.parois.map((p) =>
            p.id !== paroiId ? p : { ...p, baiesVitrees: [...p.baiesVitrees, bv] }
          ),
        }
      ));
    } else {
      const comp = {
        id: newId(), material_id: mat.id, material_name: mat.name,
        category: cat,
        epaisseur_cm: compForm.epaisseur_cm,
        r_cible: isIsolantCategory(cat) ? compForm.r_cible : "",
        lambda_lib: parseFloat(mat.valeur_r) ?? null,
        lambda_local: compForm.lambda_custom !== "" ? compForm.lambda_custom : "",
        r_lib: null,
        r_local: !isIsolantCategory(cat) && compForm.r_custom !== "" ? compForm.r_custom : "",
        surface_m2: compForm.surface_m2,
        // for "Autre": store quantite and unite_autre
        quantite: cat === "Autre" ? (parseFloat(compForm.quantite) || 1) : undefined,
        unite_autre: cat === "Autre" ? compForm.unite_autre : undefined,
        is_fixed: false,
        efficacite: 100,
        prix_unit: parseFloat(mat.prix) || 0,
        gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
        impacts: mat.impacts || {},
        dvr_materiau:   mat.dvr_materiau ?? null,
        flux_reference: mat.flux_reference ?? null,
        poids_unite:    mat.poids_unite ?? null,
      };
      setBatiments((prev) => prev.map((b) =>
        b.id !== batId ? b : {
          ...b, parois: b.parois.map((p) =>
            p.id !== paroiId ? p : { ...p, composantsOpaques: [...p.composantsOpaques, comp] }
          ),
        }
      ));
    }
    setCompModal(null);
  }

  function confirmAddBaieVitree() {
    if (!bvModal) return;
    const { batId, paroiId } = bvModal;
    const vitMat = materials.find((m) => m.id === bvForm.vitrage_id);
    const cadreMat = bvForm.cadre_id ? materials.find((m) => m.id === bvForm.cadre_id) : null;
    if (!vitMat) return;
    const bv = {
      id: newId(),
      vitrage_id: vitMat.id, vitrage_name: vitMat.name,
      material_id: vitMat.id, material_name: vitMat.name,
      valeur_r_vitrage: parseFloat(vitMat.valeur_r) || null,
      r_vitrage_local: bvForm.r_vitrage_local !== "" && parseFloat(bvForm.r_vitrage_local) > 0 ? bvForm.r_vitrage_local : null,
      cadre_id: cadreMat?.id || null, cadre_name: cadreMat?.name || null,
      valeur_r_cadre: parseFloat(cadreMat?.valeur_r) || null,
      r_cadre_local: bvForm.r_cadre_local !== "" && parseFloat(bvForm.r_cadre_local) > 0 ? bvForm.r_cadre_local : null,
      quantite: parseFloat(bvForm.quantite) || 1,
      s_vitrage_unit: bvForm.s_vitrage_unit,
      s_cadre_unit: cadreMat ? bvForm.s_cadre_unit : "0",
      is_fixed: false, efficacite: 100,
      prix_unit_vitrage: parseFloat(vitMat.prix) || 0,
      gwp100_unit_vitrage: extractImpact(vitMat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
      impacts: vitMat.impacts || {},
      dvr_materiau_vitrage: vitMat.dvr_materiau ?? null,
      dvr_materiau_cadre:  cadreMat?.dvr_materiau ?? null,
      poids_unite_vitrage: vitMat.poids_unite ?? null,
      poids_unite_cadre:   cadreMat?.poids_unite ?? null,
      impacts_cadre: cadreMat?.impacts ?? {},
      prix_unit_cadre: parseFloat(cadreMat?.prix) || 0,
    };
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : { ...p, baiesVitrees: [...p.baiesVitrees, bv] }
        ),
      }
    ));
    setBvModal(null);
  }

  function updateComposant(batId, paroiId, compId, field, value) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : {
            ...p, composantsOpaques: p.composantsOpaques.map((c) =>
              c.id === compId ? { ...c, [field]: value } : c
            ),
          }
        ),
      }
    ));
  }

  function updateBaieVitree(batId, paroiId, bvId, field, value) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : {
            ...p, baiesVitrees: p.baiesVitrees.map((bv) =>
              bv.id === bvId ? { ...bv, [field]: value } : bv
            ),
          }
        ),
      }
    ));
  }

  function removeComposant(batId, paroiId, compId, type) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : {
            ...p,
            composantsOpaques: type === "opaque"
              ? p.composantsOpaques.filter((c) => c.id !== compId)
              : p.composantsOpaques,
            baiesVitrees: type === "vitree"
              ? p.baiesVitrees.filter((c) => c.id !== compId)
              : p.baiesVitrees,
          }
        ),
      }
    ));
  }

  function toggleParoi(paroiId) {
    setExpandedParois((prev) => {
      const next = new Set(prev);
      if (next.has(paroiId)) next.delete(paroiId); else next.add(paroiId);
      return next;
    });
  }

  function getParoiTab(paroiId) { return activeParoiTabs[paroiId] || "consommation"; }
  function setParoiTab(paroiId, tab) { setActiveParoiTabs((prev) => ({ ...prev, [paroiId]: tab })); }

  function handleOpenOptimise(batId) {
    ensureMaterials();
    setOptBatId(batId);
  }

  function handleCacheSaved(newHash, newCache) {
    setOptCachedHash(newHash);
    setOptCachedResult(newCache);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!project) return <div style={{ color: "#6b7280" }}>{error || "Chargement…"}</div>;

  return (
    <div style={{ maxWidth: 1400, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#6b7280" }}>Projet</div>
        {saveStatus !== "idle" && (
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: saveStatus === "saving" ? "#9ca3af" : "#059669",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {saveStatus === "saving" ? (
              <>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  background: "#9ca3af", animation: "pulse 1s infinite",
                }} />
                Sauvegarde…
              </>
            ) : (
              <>✓ Sauvegardé</>
            )}
          </div>
        )}
      </div>
      <h1 style={{ fontSize: 36, margin: "6px 0 6px" }}>Analyse ACV — {project.project_name}</h1>
      <div style={{ color: "#6b7280" }}>Créez des configurations de bâtiment et comparez leurs résultats.</div>

      {error && (
        <div style={{ marginTop: 12, background: "#fee2e2", color: "#8f1d2f", padding: 12, borderRadius: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button type="button" onClick={openAddBatiment}
          style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Plus size={15} /> Nouveau bâtiment
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {batiments.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 14,
            border: "2px dashed #e5e7eb", borderRadius: 16, marginTop: 8,
          }}>
            Aucun bâtiment — cliquez sur <strong>Nouveau bâtiment</strong> pour commencer
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {batiments.map((bat) => {
              const isSelected = bat.id === selectedId;
              const stats = calcBatimentStats(bat);
              return (
                <div key={bat.id}>
                  {/* Compact row */}
                  <div
                    className="hs-clickable"
                    onClick={() => selectBatiment(bat.id)}
                    style={{
                      ...batRow,
                      background: isSelected ? "#f5f3ff" : "white",
                      borderColor: isSelected ? "#8b5cf6" : "#eef2f7",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div style={{ color: "#59169c" }}>
                        {isSelected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                      {editingBatId === bat.id ? (
                        <input
                          type="text" autoFocus
                          value={editBatNom}
                          onChange={(e) => setEditBatNom(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { updateBatiment(bat.id, "nom", editBatNom.trim() || bat.nom); setEditingBatId(null); }
                            else if (e.key === "Escape") { setEditingBatId(null); }
                          }}
                          onBlur={() => { updateBatiment(bat.id, "nom", editBatNom.trim() || bat.nom); setEditingBatId(null); }}
                          style={{ ...miniInput, fontWeight: 700, fontSize: 15, width: 170 }}
                        />
                      ) : (
                        <div
                          style={{ fontWeight: 700, fontSize: 15 }}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => { e.stopPropagation(); setEditBatNom(bat.nom); setEditingBatId(bat.id); }}
                        >
                          {bat.nom}
                        </div>
                      )}
                      {bat.type_batiment === "renovation" ? (
                        <span style={{ fontSize: 11, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 6, padding: "2px 7px", fontWeight: 700, flexShrink: 0 }}>À rénover</span>
                      ) : (
                        <span style={{ fontSize: 11, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 6, padding: "2px 7px", fontWeight: 700, flexShrink: 0 }}>Neuf</span>
                      )}
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>
                        {bat.parois.length} paroi{bat.parois.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <SmallStat label="Dép." value={stats.dep_wk != null ? `${fmt(stats.dep_wk)} W/K` : "—"} />
                      <SmallStat label="CO₂/an" value={stats.co2_exploitation != null ? `${fmt(stats.co2_exploitation)} kg` : "—"} />
                      <SmallStat label="Coût" value={stats.total_cout != null ? `${fmt(stats.total_cout)} €` : "—"} />
                    </div>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); removeBatiment(bat.id); }}
                      style={iconBtn} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Detail view */}
                  {isSelected && (
                    <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "flex-start" }}>
                      {/* Left 60% */}
                      <div style={{ flex: "0 0 60%" }}>
                        <BuildingDetail
                          bat={bat}
                          updateBatiment={updateBatiment}
                          expandedParois={expandedParois}
                          toggleParoi={toggleParoi}
                          getParoiTab={getParoiTab}
                          setParoiTab={setParoiTab}
                          openAddParoi={() => openAddParoi(bat.id)}
                          updateParoi={updateParoi}
                          removeParoi={removeParoi}
                          openAddComposant={(paroiId, type) => openAddComposant(bat.id, paroiId, type)}
                          updateComposant={updateComposant}
                          updateBaieVitree={updateBaieVitree}
                          removeComposant={removeComposant}
                          openReplaceOpaque={(paroiId, compId) => openReplaceOpaque(bat.id, paroiId, compId)}
                          openReplaceVitrage={(paroiId, bvId)  => openReplaceVitrage(bat.id, paroiId, bvId)}
                          openReplaceCadre={(paroiId, bvId)    => openReplaceCadre(bat.id, paroiId, bvId)}
                          materials={materials}
                        />
                      </div>
                      {/* Right 40% */}
                      <div style={{ flex: "0 0 calc(40% - 16px)" }}>
                        <ResultsWidget bat={bat} stats={stats} auditKwh={auditKwh}
                          onOptimize={() => handleOpenOptimise(bat.id)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Bâtiment Modal */}
      {batModal && (() => {
        const ageVal = parseInt(batForm.age_batiment, 10);
        const ageOk = batForm.age_batiment !== "" && isFinite(ageVal) && ageVal >= 0 &&
          (batForm.type_batiment !== "renovation" || ageVal > 0);
        const canCreate = !!batForm.nom.trim() && ageOk;
        return (
          <ModalOverlay onClose={() => setBatModal(false)}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Nouveau bâtiment</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Nom">
                <input type="text" value={batForm.nom} autoFocus
                  onChange={(e) => setBatForm((f) => ({ ...f, nom: e.target.value }))}
                  style={inputStyle} placeholder="ex : Bâtiment principal" />
              </Field>
              <Field label="Type de bâtiment">
                <select value={batForm.type_batiment}
                  onChange={(e) => setBatForm((f) => ({
                    ...f,
                    type_batiment: e.target.value,
                    age_batiment: e.target.value === "neuf" ? "0" : "",
                  }))}
                  style={inputStyle}>
                  <option value="neuf">Neuf</option>
                  <option value="renovation">À rénover</option>
                </select>
              </Field>
              <Field label="Âge du bâtiment (années)">
                <input type="number" min="0" step="1"
                  value={batForm.age_batiment}
                  onChange={(e) => setBatForm((f) => ({ ...f, age_batiment: e.target.value }))}
                  style={inputStyle}
                  placeholder={batForm.type_batiment === "neuf" ? "0" : "ex : 25"} />
                {batForm.type_batiment === "renovation" && (
                  <span style={{ fontSize: 11, color: "#ea580c", marginTop: 2 }}>
                    Valeur &gt; 0 requise pour une rénovation
                  </span>
                )}
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setBatModal(false)} style={cancelBtn}>Annuler</button>
              <button type="button" onClick={confirmAddBatiment} disabled={!canCreate}
                style={{ ...primaryBtn, opacity: canCreate ? 1 : 0.5 }}>
                Créer
              </button>
            </div>
          </ModalOverlay>
        );
      })()}

      {/* Add Paroi Modal */}
      {paroiModal && (
        <ModalOverlay onClose={() => setParoiModal(null)}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Nouvelle paroi</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Nom">
              <input type="text" value={paroiForm.nom} autoFocus
                onChange={(e) => setParoiForm((f) => ({ ...f, nom: e.target.value }))}
                style={inputStyle} placeholder="ex : Mur sud" />
            </Field>
            <Field label="Type">
              <select value={paroiForm.type}
                onChange={(e) => setParoiForm((f) => ({ ...f, type: e.target.value }))}
                style={inputStyle}>
                {PAROI_TYPES.map((t) => <option key={t} value={t}>{PAROI_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Surface totale (m²)">
              <input type="number" min="0" step="any" value={paroiForm.surface_totale}
                onChange={(e) => setParoiForm((f) => ({ ...f, surface_totale: e.target.value }))}
                style={inputStyle} placeholder="ex : 18" />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button type="button" onClick={() => setParoiModal(null)} style={cancelBtn}>Annuler</button>
            <button type="button" onClick={confirmAddParoi} disabled={!paroiForm.nom.trim()}
              style={{ ...primaryBtn, opacity: paroiForm.nom.trim() ? 1 : 0.5 }}>
              Ajouter
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Migration ACV 1.0 → 2.0 — modal bloquant */}
      {migrationModal && (() => {
        const a = parseInt(migrationForm.age, 10);
        const d = parseInt(migrationForm.dvr, 10);
        const canConfirm = migrationForm.age !== "" && isFinite(a) && a >= 0 &&
          migrationForm.dvr !== "" && isFinite(d) && d > 0;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
            <div style={{ background: "white", borderRadius: 16, padding: "28px 30px", width: 460, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Activation des calculs ACV</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
                Ce projet a été créé avec ACV 1.0. Pour activer les calculs ACV, saisissez l'âge et la DVR du bâtiment.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Âge du bâtiment (années)">
                  <input type="number" min="0" step="1" autoFocus
                    value={migrationForm.age}
                    onChange={(e) => setMigrationForm((f) => ({ ...f, age: e.target.value }))}
                    style={inputStyle} placeholder="0 pour un bâtiment neuf" />
                </Field>
                <Field label="DVR du bâtiment (années)">
                  <input type="number" min="1" step="1"
                    value={migrationForm.dvr}
                    onChange={(e) => setMigrationForm((f) => ({ ...f, dvr: e.target.value }))}
                    style={inputStyle} placeholder="60" />
                  <span style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    Durée de Vie de Référence — par défaut 60 ans
                  </span>
                </Field>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                <button type="button" disabled={!canConfirm} onClick={confirmMigration}
                  style={{ ...primaryBtn, opacity: canConfirm ? 1 : 0.5 }}>
                  Valider et continuer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Material side panel */}
      {compModal && (
        <MaterialSidePanel
          modal={compModal} form={compForm} setForm={setCompForm}
          materials={materials}
          onConfirm={
            compModal.mode === "replace_opaque"  ? confirmReplaceOpaque  :
            compModal.mode === "replace_vitrage" ? confirmReplaceVitrage :
            compModal.mode === "replace_cadre"   ? confirmReplaceCadre   :
            confirmAddComposant
          }
          onClose={() => setCompModal(null)}
        />
      )}

      {/* Baie vitrée modal */}
      {bvModal && (
        <BaieVitreeModal
          materials={materials}
          form={bvForm}
          setForm={setBvForm}
          onClose={() => setBvModal(null)}
          onConfirm={confirmAddBaieVitree}
        />
      )}

      {/* Optimisation panel */}
      {optBatId && (() => {
        const optBat = batiments.find(b => b.id === optBatId);
        if (!optBat) return null;
        return (
          <OptimisationPanel
            bat={optBat}
            materials={materials}
            projectId={projectId}
            onClose={() => setOptBatId(null)}
            cachedHash={optCachedHash}
            cachedResult={optCachedResult}
            onCacheSaved={handleCacheSaved}
            batiments={batiments}
            onApplyProfile={(newBat) => setBatiments(prev => [...prev, newBat])}
          />
        );
      })()}
    </div>
  );
}

// ─── BuildingDetail ───────────────────────────────────────────────────────────

function BuildingDetail({
  bat, updateBatiment, expandedParois, toggleParoi, getParoiTab, setParoiTab,
  openAddParoi, updateParoi, removeParoi,
  openAddComposant, updateComposant, updateBaieVitree, removeComposant,
  openReplaceOpaque, openReplaceVitrage, openReplaceCadre,
  materials,
}) {
  return (
    <div style={detailCard}>
      <div style={cardTitle}>Construction du bâtiment</div>

      <div style={sectionLabel}>Paramètres énergétiques</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <Field label="Type de bâtiment">
          <select value={bat.type_batiment || "neuf"}
            onChange={(e) => updateBatiment(bat.id, "type_batiment", e.target.value)}
            style={inputStyle}>
            <option value="neuf">Neuf</option>
            <option value="renovation">À rénover</option>
          </select>
        </Field>
        <Field label="Surface plancher (m²)">
          <input type="number" min="0" step="any" value={bat.surface_plancher}
            onChange={(e) => updateBatiment(bat.id, "surface_plancher", e.target.value)}
            style={inputStyle} placeholder="ex : 120" />
        </Field>
        <Field label="Hauteur (m)">
          <input type="number" min="0" step="any" value={bat.hauteur}
            onChange={(e) => updateBatiment(bat.id, "hauteur", e.target.value)}
            style={inputStyle} placeholder="ex : 2.5" />
        </Field>
        <Field label="Température cible (°C)">
          <input type="number" min="10" max="30" step="0.5" value={bat.temperature_interieure}
            onChange={(e) => updateBatiment(bat.id, "temperature_interieure", e.target.value)}
            style={inputStyle} />
        </Field>
        <Field label="Chauffage">
          <select value={bat.moyen_chauffage}
            onChange={(e) => updateBatiment(bat.id, "moyen_chauffage", e.target.value)}
            style={inputStyle}>
            {CHAUFFAGE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Degrés-jours (DJ)">
          <input type="number" min="0" value={bat.degres_jours}
            onChange={(e) => updateBatiment(bat.id, "degres_jours", e.target.value)}
            style={inputStyle} />
        </Field>
        <Field label={
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            DVR bâtiment (ans)
            <span
              title="Durée de Vie de Référence du bâtiment, utilisée pour amortir les impacts ACV des matériaux sur la durée de vie totale du bâtiment."
              style={{ cursor: "help", color: "#9ca3af", fontSize: 13 }}>ⓘ</span>
          </span>
        }>
          <input type="number" min="1" step="1"
            value={bat.dvr_batiment ?? 60}
            onChange={(e) => updateBatiment(bat.id, "dvr_batiment", parseInt(e.target.value, 10) || 60)}
            style={inputStyle} />
        </Field>
        <Field label="Âge (années)">
          <input type="number" min="0" step="1"
            value={bat.age_batiment ?? ""}
            onChange={(e) => updateBatiment(bat.id, "age_batiment", parseInt(e.target.value, 10) || 0)}
            style={inputStyle} placeholder="0" />
        </Field>
      </div>

      {bat.age_batiment == null && (
        <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#92400e", marginBottom: 10 }}>
          Données ACV manquantes. Saisissez l'âge et la DVR du bâtiment pour activer les calculs avancés.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={sectionLabel}>Parois</div>
        <button type="button" onClick={openAddParoi}
          style={{ ...smallBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={12} /> Ajouter une paroi
        </button>
      </div>

      {bat.parois.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13, border: "1.5px dashed #e5e7eb", borderRadius: 10 }}>
          Aucune paroi — cliquez sur <strong>Ajouter une paroi</strong>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bat.parois.map((paroi) => {
            const isExpanded = expandedParois.has(paroi.id);
            const stats = calcParoiStats(paroi, bat.dvr_batiment ?? 60);
            const tab = getParoiTab(paroi.id);
            const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
            const dj = parseFloat(bat.degres_jours) || 1950.7;
            const dep_contrib = stats?.dep_wk ?? null;
            const energy_contrib = dep_contrib != null ? (dep_contrib * dj * 24) / 1000 / ch.rendement : null;
            const co2_contrib = energy_contrib != null ? energy_contrib * ch.co2 : null;
            return (
              <ParoiCard
                key={paroi.id}
                bat={bat} paroi={paroi} stats={stats}
                isExpanded={isExpanded} tab={tab}
                dep_contrib={dep_contrib} energy_contrib={energy_contrib} co2_contrib={co2_contrib}
                toggleParoi={() => toggleParoi(paroi.id)}
                setTab={(t) => setParoiTab(paroi.id, t)}
                updateParoi={(field, val) => updateParoi(bat.id, paroi.id, field, val)}
                removeParoi={() => removeParoi(bat.id, paroi.id)}
                openAddComposant={(type) => openAddComposant(paroi.id, type)}
                updateComposant={(compId, field, val) => updateComposant(bat.id, paroi.id, compId, field, val)}
                updateBaieVitree={(bvId, field, val) => updateBaieVitree(bat.id, paroi.id, bvId, field, val)}
                removeComposant={(compId, type) => removeComposant(bat.id, paroi.id, compId, type)}
                openReplaceOpaque={(compId) => openReplaceOpaque(paroi.id, compId)}
                openReplaceVitrage={(bvId)  => openReplaceVitrage(paroi.id, bvId)}
                openReplaceCadre={(bvId)    => openReplaceCadre(paroi.id, bvId)}
                materials={materials}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ParoiCard ────────────────────────────────────────────────────────────────

function ParoiCard({
  bat, paroi, stats, isExpanded, tab,
  dep_contrib, energy_contrib, co2_contrib,
  toggleParoi, setTab, updateParoi, removeParoi,
  openAddComposant, updateComposant, updateBaieVitree, removeComposant,
  openReplaceOpaque, openReplaceVitrage, openReplaceCadre,
  materials,
}) {
  const [editingName, setEditingName] = useState(false);
  const [editNameVal, setEditNameVal] = useState("");
  return (
    <div style={paroiCardStyle}>
      {/* Header */}
      <div onClick={toggleParoi} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
        <div style={{ color: "#59169c", marginTop: 2, flexShrink: 0 }}>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {editingName ? (
                <input
                  type="text" autoFocus
                  value={editNameVal}
                  onChange={(e) => setEditNameVal(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { updateParoi("nom", editNameVal.trim() || paroi.nom); setEditingName(false); }
                    else if (e.key === "Escape") { setEditingName(false); }
                  }}
                  onBlur={() => { updateParoi("nom", editNameVal.trim() || paroi.nom); setEditingName(false); }}
                  style={{ ...miniInput, fontWeight: 700, fontSize: 14, width: 150 }}
                />
              ) : (
                <span
                  style={{ fontWeight: 700, fontSize: 14 }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditNameVal(paroi.nom); setEditingName(true); }}
                >
                  {paroi.nom}
                </span>
              )}
            <span style={{ fontSize: 11, background: "#ede9fe", color: "#59169c", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>
              {PAROI_TYPE_LABELS[paroi.type] || paroi.type}
            </span>
            {paroi.is_fixed && (
              <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 5, fontWeight: 700 }}>
                Exclue optim.
              </span>
            )}
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {paroi.surface_totale ? `${paroi.surface_totale} m²` : "— m²"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
            <MiniStat label="R total" value={stats?.r_total != null ? `${fmtDec(stats.r_total)} m²K/W` : "—"} />
            <MiniStat label="U moyen" value={stats?.u_moyen != null ? `${fmtDec(stats.u_moyen)} W/m²K` : "—"} />
            <MiniStat label="Coût" value={stats?.cout != null ? `${fmt(stats.cout)} €` : "—"} />
            <MiniStat label="GWP100" value={stats?.gwp != null ? `${fmt(stats.gwp)} kg CO₂eq` : "—"} />
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); updateParoi("is_fixed", !paroi.is_fixed); }}
          style={{ ...iconBtn, color: paroi.is_fixed ? "#59169c" : "#9ca3af", background: paroi.is_fixed ? "#ede9fe" : "white" }}
          title={paroi.is_fixed ? "Réintégrer dans l'optimisation" : "Exclure de l'optimisation"}
        >
          {paroi.is_fixed ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); removeParoi(); }}
          style={iconBtn} title="Supprimer la paroi">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div style={{ marginTop: 12 }}>
          {/* Editable header fields */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Nom">
              <input type="text" value={paroi.nom}
                onChange={(e) => updateParoi("nom", e.target.value)}
                style={{ ...inputStyle, minWidth: 100 }}
                onClick={(e) => e.stopPropagation()} />
            </Field>
            <Field label="Type">
              <select value={paroi.type}
                onChange={(e) => updateParoi("type", e.target.value)}
                style={inputStyle} onClick={(e) => e.stopPropagation()}>
                {PAROI_TYPES.map((t) => <option key={t} value={t}>{PAROI_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Surface totale (m²)">
              <input type="number" min="0" step="any" value={paroi.surface_totale}
                onChange={(e) => updateParoi("surface_totale", e.target.value)}
                style={inputStyle} onClick={(e) => e.stopPropagation()} />
            </Field>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: "flex", borderBottom: "1.5px solid #f3f4f6", marginBottom: 12 }}>
            {["consommation", "impacts"].map((t) => (
              <button key={t} type="button"
                onClick={(e) => { e.stopPropagation(); setTab(t); }}
                style={{
                  padding: "7px 16px", border: "none",
                  borderBottom: tab === t ? "2px solid #59169c" : "2px solid transparent",
                  background: "transparent",
                  fontWeight: tab === t ? 700 : 500, fontSize: 13,
                  color: tab === t ? "#59169c" : "#6b7280",
                  cursor: "pointer", marginBottom: -1.5,
                }}>
                {t === "consommation" ? "Consommation" : "Impacts"}
              </button>
            ))}
          </div>

          {tab === "consommation" && (
            <ConsommationTab
              paroi={paroi} stats={stats}
              dvr_batiment={bat?.dvr_batiment ?? 60}
              dep_contrib={dep_contrib} energy_contrib={energy_contrib} co2_contrib={co2_contrib}
              openAddComposant={openAddComposant}
              updateComposant={updateComposant}
              updateBaieVitree={updateBaieVitree}
              removeComposant={removeComposant}
              openReplaceOpaque={openReplaceOpaque}
              openReplaceVitrage={openReplaceVitrage}
              openReplaceCadre={openReplaceCadre}
              materials={materials}
            />
          )}
          {tab === "impacts" && (
            <ImpactsTab paroi={paroi} stats={stats} dvr_batiment={bat?.dvr_batiment ?? 60} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── ConsommationTab ──────────────────────────────────────────────────────────

function ConsommationTab({ paroi, stats, dvr_batiment = 60, dep_contrib, energy_contrib, co2_contrib, openAddComposant, updateComposant, updateBaieVitree, removeComposant, openReplaceOpaque, openReplaceVitrage, openReplaceCadre, materials }) {
  return (
    <div>
      {/* Composants opaques */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={sectionLabel}>Composants opaques</div>
        <button type="button" onClick={(e) => { e.stopPropagation(); openAddComposant("opaque"); }} style={smallBtn}>
          <Plus size={11} /> Ajouter
        </button>
      </div>

      {paroi.composantsOpaques.length === 0 ? (
        <div style={emptyMsg}>Aucun composant opaque — S opaque = {stats ? `${fmtDec(stats.s_opaque, 1)} m²` : "—"}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
              <th style={th}>Matériau</th>
              <th style={{ ...th, minWidth: 70 }}>Ép. (cm)</th>
              <th style={{ ...th, minWidth: 70 }}>λ / R <span title="λ (W/m·K) pour Isolants — R direct (m²·K/W) pour non-isolants" style={{ color: "#9ca3af", cursor: "help", fontWeight: 400 }}>(?)</span></th>
              <th style={{ ...th, minWidth: 82 }}>R / R cible</th>
              <th style={{ ...th, minWidth: 70 }}>S (m²)</th>
              <th style={{ ...th, minWidth: 64 }}>Eff. %</th>
              <th style={{ ...th, textAlign: "center", minWidth: 40 }}>Fixe</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {paroi.composantsOpaques.map((co) => {
              const r = getComposantR(co);
              const eff = parseFloat(co.efficacite) || 100;
              const rEff = r != null ? r * (eff / 100) : null;
              const uEff = rEff != null && rEff > 0 ? 1 / rEff : null;
              const lambdaIsCustom = co.lambda_local !== "" && co.lambda_local != null;
              const rIsCustom = co.r_local !== "" && co.r_local != null;
              const isIsolant = isIsolantCategory(co.category);
              const lambdaEff = parseFloat(co.lambda_local) || parseFloat(co.lambda_lib);
              const lambdaMissing = !isFinite(lambdaEff) || lambdaEff <= 0;
              const epDisplay = co.epaisseur_cm ? `${parseFloat(co.epaisseur_cm).toFixed(0)} cm` : "—";
              const matLib = materials.find(m => m.id === co.material_id);
              const trueLambda = isIsolant && matLib ? getLambda(matLib) : null;
              return (
                <tr key={co.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <div
                        style={{ fontWeight: 600, fontSize: 12, cursor: "pointer", color: "#374151" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#59169c"; e.currentTarget.style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "#374151"; e.currentTarget.style.textDecoration = "none"; }}
                        onClick={() => openReplaceOpaque(co.id)}
                        title="Changer de matériau"
                      >{co.material_name}</div>
                      {(() => {
                        const r = calcComposantACV(co, dvr_batiment, stats?.s_opaque ?? 0);
                        return (
                          <>
                            {!r.valid && <span title={r.errorMsg} style={{ background:"#fee2e2", color:"#dc2626", fontSize:10, padding:"1px 5px", borderRadius:4, fontWeight:600, cursor:"help" }}>⚠ ACV</span>}
                            {r.valid && !r.decon_valid && <span title="Poids/unité manquant — Module C déconstruction non calculé" style={{ background:"#fef3c7", color:"#d97706", fontSize:10, padding:"1px 5px", borderRadius:4, fontWeight:600, cursor:"help", marginLeft:2 }}>⚠ DÉCON</span>}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                      {isIsolant
                        ? (r != null ? `R cible = ${fmtDec(r)} m²K/W (ép. ~${epDisplay})` : "R cible = —")
                        : (r != null ? `R = ${fmtDec(r)} m²K/W` : "R = —")
                      }
                    </div>
                    {isIsolant && (() => {
                      const flux = parseFloat(co.flux_reference);
                      const rCible = parseFloat(co.r_cible);
                      const surface = parseFloat(co.surface_m2) || 0;
                      const fluxOk = isFinite(flux) && flux > 0;
                      const qtyAcv = (fluxOk && isFinite(rCible) && rCible > 0 && surface > 0)
                        ? rCible * flux * surface : null;
                      return (
                        <>
                          <div style={{ fontSize: 10, marginTop: 1, color: fluxOk ? "#9ca3af" : "#dc2626" }}>
                            {fluxOk ? `Flux : ${fmtDec(flux, 2)} kg/m²·K/W` : "Flux : non défini"}
                          </div>
                          {qtyAcv != null && (
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                              Qté ACV : {fmtDec(qtyAcv, 2)} kg
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td style={td}>
                    {isIsolant ? (
                      <input type="number" min="0" step="any" value={co.epaisseur_cm}
                        onChange={(e) => {
                          const ep = parseFloat(e.target.value);
                          updateComposant(co.id, "epaisseur_cm", e.target.value);
                          if (trueLambda != null && trueLambda > 0 && isFinite(ep) && ep > 0) {
                            updateComposant(co.id, "r_cible", String(((ep / 100) / trueLambda).toFixed(3)));
                          }
                        }}
                        style={miniInput} placeholder="ép." />
                    ) : (
                      <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {isIsolant ? (
                      <span title="λ — Conductivité thermique (W/m·K), propriété du matériau (lecture seule)"
                            style={{ fontSize: 11, color: "#6b7280" }}>
                        {trueLambda != null ? `${trueLambda} (λ)` : "—"}
                      </span>
                    ) : (
                      <span title="R — Résistance thermique (m²·K/W)" style={{ fontSize: 11, color: "#6b7280" }}>
                        {co.lambda_lib != null ? `${fmtDec(co.lambda_lib)} (R)` : "—"}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {isIsolant ? (
                      <span style={{ fontSize: 12, color: "#374151" }}>
                        {co.r_cible != null && co.r_cible !== "" ? parseFloat(co.r_cible).toFixed(3) : "—"}
                      </span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <input type="number" min="0" step="any" value={co.r_local}
                          onChange={(e) => updateComposant(co.id, "r_local", e.target.value)}
                          style={miniInput} placeholder={r != null ? fmtDec(r) : "—"} />
                        {rIsCustom && <Pencil size={10} color="#f59e0b" />}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 12, color: "#374151" }}>
                      {stats?.s_opaque != null ? fmtDec(stats.s_opaque, 1) : "—"}
                    </span>
                  </td>
                  <td style={td}>
                    <input type="number" min="0" max="100" step="1"
                      value={co.efficacite ?? 100}
                      onChange={(e) => updateComposant(co.id, "efficacite", Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      style={{ ...miniInput, width: 56 }} />
                    {eff < 100 && uEff != null && (
                      <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>U: {fmtDec(uEff)}</div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input type="checkbox" checked={!!co.is_fixed}
                      onChange={(e) => updateComposant(co.id, "is_fixed", e.target.checked)}
                      title="Composant fixe (non modifiable)" />
                  </td>
                  <td style={td}>
                    <button type="button" onClick={() => removeComposant(co.id, "opaque")} style={tinyIconBtn}>
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Baies vitrées */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={sectionLabel}>Baies vitrées</div>
        <button type="button" onClick={(e) => { e.stopPropagation(); openAddComposant("vitree"); }} style={smallBtn}>
          <Plus size={11} /> Ajouter
        </button>
      </div>

      {paroi.baiesVitrees.some((bv) => !bv.vitrage_id) && (
        <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 11, color: "#92400e" }}>
          Des baies legacy (format monolithique) sont présentes. Recréez-les avec le nouveau formulaire pour bénéficier du calcul vitrage + cadre.
        </div>
      )}

      {paroi.baiesVitrees.length === 0 ? (
        <div style={emptyMsg}>Aucune baie vitrée — S vitrée = 0 m²</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
              <th style={th}>Vitrage</th>
              <th style={th}>Cadre</th>
              <th style={{ ...th, minWidth: 60 }}>Qté</th>
              <th style={{ ...th, minWidth: 72 }}>S vit/u (m²)</th>
              <th style={{ ...th, minWidth: 72 }}>S cad/u (m²)</th>
              <th style={{ ...th, minWidth: 72 }}>R vit.</th>
              <th style={{ ...th, minWidth: 72 }}>R cad.</th>
              <th style={{ ...th, minWidth: 82 }}>R fen. (m²K/W)</th>
              <th style={{ ...th, minWidth: 64 }}>Eff. %</th>
              <th style={{ ...th, textAlign: "center", minWidth: 40 }}>Fixe</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {paroi.baiesVitrees.map((bv) => {
              const isLegacy = !bv.vitrage_id;
              const qty = parseFloat(bv.quantite) || 1;
              const rVLocal = bv.r_vitrage_local != null && parseFloat(bv.r_vitrage_local) > 0;
              const rCLocal = bv.r_cadre_local  != null && parseFloat(bv.r_cadre_local)  > 0;
              const rV = rVLocal ? parseFloat(bv.r_vitrage_local) : parseFloat(bv.valeur_r_vitrage);
              const rC = rCLocal ? parseFloat(bv.r_cadre_local)  : parseFloat(bv.valeur_r_cadre);
              const sv = parseFloat(bv.s_vitrage_unit) || 0;
              const sc = parseFloat(bv.s_cadre_unit) || 0;
              const sTot = sv + sc;
              let rFen = null;
              if (isLegacy) {
                const legR = parseFloat(bv.r_local) > 0 ? parseFloat(bv.r_local) : parseFloat(bv.valeur_r);
                rFen = isFinite(legR) && legR > 0 ? legR : null;
              } else if (isFinite(rV) && rV > 0 && sTot > 0) {
                const uaV = sv > 0 ? sv / rV : 0;
                const uaC = isFinite(rC) && rC > 0 && sc > 0 ? sc / rC : 0;
                rFen = sTot / (uaV + uaC);
              }
              const bvEff = parseFloat(bv.efficacite) || 100;
              const uEff = rFen != null && rFen > 0 ? (1 / rFen) / (bvEff / 100) : null;
              return (
                <tr key={bv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}>
                    {isLegacy
                      ? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>{bv.material_name || "—"} <span style={{ fontSize: 10 }}>(legacy)</span></span>
                      : <div>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                            <span style={{ cursor: "pointer", color: "#374151" }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#59169c"; e.currentTarget.style.textDecoration = "underline"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "#374151"; e.currentTarget.style.textDecoration = "none"; }}
                              onClick={() => openReplaceVitrage(bv.id)}
                              title="Changer le vitrage">{bv.vitrage_name || "—"}</span>
                            {(() => {
                              const r = calcBVImpactACV(bv, dvr_batiment);
                              return (
                                <>
                                  {!r.valid && <span title={r.errorMsg} style={{ background:"#fee2e2", color:"#dc2626", fontSize:10, padding:"1px 5px", borderRadius:4, fontWeight:600, cursor:"help" }}>⚠ ACV</span>}
                                  {r.valid && !r.decon_valid && <span title="Poids/unité manquant sur vitrage ou cadre — Module C déconstruction non calculé" style={{ background:"#fef3c7", color:"#d97706", fontSize:10, padding:"1px 5px", borderRadius:4, fontWeight:600, cursor:"help", marginLeft:2 }}>⚠ DÉCON</span>}
                                </>
                              );
                            })()}
                          </span>
                          {qty > 1 && (
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>×{qty} unités</div>
                          )}
                        </div>}
                  </td>
                  <td style={td}>
                    {isLegacy
                      ? <span style={{ color: "#9ca3af" }}>—</span>
                      : bv.cadre_name
                        ? <span style={{ cursor: "pointer", color: "#374151" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#59169c"; e.currentTarget.style.textDecoration = "underline"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "#374151"; e.currentTarget.style.textDecoration = "none"; }}
                            onClick={() => openReplaceCadre(bv.id)}
                            title="Changer le cadre">{bv.cadre_name}</span>
                        : <span style={{ cursor: "pointer", color: "#9ca3af", fontSize: 11 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#59169c"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
                            onClick={() => openReplaceCadre(bv.id)}
                            title="Ajouter un cadre">+ cadre</span>}
                  </td>
                  <td style={td}>
                    <input type="number" min="1" value={bv.quantite}
                      onChange={(e) => updateBaieVitree(bv.id, "quantite", e.target.value)}
                      style={miniInput} />
                  </td>
                  <td style={td}>
                    {isLegacy
                      ? <input type="number" min="0" step="any" value={bv.surface_par_unite ?? ""}
                          onChange={(e) => updateBaieVitree(bv.id, "surface_par_unite", e.target.value)}
                          style={miniInput} placeholder="m²" />
                      : <input type="number" min="0" step="any" value={bv.s_vitrage_unit ?? ""}
                          onChange={(e) => updateBaieVitree(bv.id, "s_vitrage_unit", e.target.value)}
                          style={miniInput} placeholder="m²" />}
                  </td>
                  <td style={td}>
                    {isLegacy
                      ? <span style={{ color: "#9ca3af" }}>—</span>
                      : <input type="number" min="0" step="any" value={bv.s_cadre_unit ?? ""}
                          onChange={(e) => updateBaieVitree(bv.id, "s_cadre_unit", e.target.value)}
                          style={miniInput} placeholder="m²" />}
                  </td>
                  <td style={td}>
                    {isLegacy
                      ? <span style={{ color: "#9ca3af" }}>—</span>
                      : <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <input type="number" min="0" step="any"
                            value={rVLocal ? bv.r_vitrage_local : ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "" || (bv.valeur_r_vitrage != null && parseFloat(val) === parseFloat(bv.valeur_r_vitrage))) {
                                updateBaieVitree(bv.id, "r_vitrage_local", null);
                              } else {
                                updateBaieVitree(bv.id, "r_vitrage_local", val);
                              }
                            }}
                            style={{ ...miniInput, ...(rVLocal ? { color: "#2563eb" } : {}) }}
                            placeholder={bv.valeur_r_vitrage != null ? fmtDec(parseFloat(bv.valeur_r_vitrage), 3) : "—"} />
                          {rVLocal && <Pencil size={10} color="#2563eb" />}
                        </div>}
                  </td>
                  <td style={td}>
                    {isLegacy || !bv.cadre_id
                      ? <span style={{ color: "#9ca3af" }}>—</span>
                      : <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <input type="number" min="0" step="any"
                            value={rCLocal ? bv.r_cadre_local : ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "" || (bv.valeur_r_cadre != null && parseFloat(val) === parseFloat(bv.valeur_r_cadre))) {
                                updateBaieVitree(bv.id, "r_cadre_local", null);
                              } else {
                                updateBaieVitree(bv.id, "r_cadre_local", val);
                              }
                            }}
                            style={{ ...miniInput, ...(rCLocal ? { color: "#2563eb" } : {}) }}
                            placeholder={bv.valeur_r_cadre != null ? fmtDec(parseFloat(bv.valeur_r_cadre), 3) : "—"} />
                          {rCLocal && <Pencil size={10} color="#2563eb" />}
                        </div>}
                  </td>
                  <td style={td}>
                    {isLegacy ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <input type="number" min="0" step="any"
                          value={bv.r_local !== "" && bv.r_local != null ? bv.r_local : (bv.valeur_r ?? "")}
                          onChange={(e) => updateBaieVitree(bv.id, "r_local", e.target.value)}
                          style={miniInput}
                          placeholder={bv.valeur_r != null ? fmtDec(bv.valeur_r) : "—"} />
                        {bv.r_local !== "" && bv.r_local != null && <Pencil size={10} color="#f59e0b" />}
                      </div>
                    ) : (
                      <span style={{ color: rFen != null ? "#111827" : "#9ca3af" }}>
                        {rFen != null ? fmtDec(rFen, 3) : "—"}
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    <input type="number" min="0" max="100" step="1"
                      value={bv.efficacite ?? 100}
                      onChange={(e) => updateBaieVitree(bv.id, "efficacite", Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      style={{ ...miniInput, width: 56 }} />
                    {bvEff < 100 && uEff != null && (
                      <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>U: {fmtDec(uEff)}</div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input type="checkbox" checked={!!bv.is_fixed}
                      onChange={(e) => updateBaieVitree(bv.id, "is_fixed", e.target.checked)}
                      title="Composant fixe (non modifiable)" />
                  </td>
                  <td style={td}>
                    <button type="button" onClick={() => removeComposant(bv.id, "vitree")} style={tinyIconBtn}>
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Summary */}
      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MiniStat label="Dép. paroi" value={dep_contrib != null ? `${fmt(dep_contrib)} W/K` : "—"} highlight />
        <MiniStat label="Énergie/an" value={energy_contrib != null ? `${fmt(energy_contrib)} kWh` : "—"} />
        <MiniStat label="CO₂/an" value={co2_contrib != null ? `${fmt(co2_contrib)} kg` : "—"} />
        <MiniStat label="S vitrée" value={stats ? `${fmtDec(stats.s_vitree, 1)} m²` : "—"} />
        <MiniStat label="S opaque" value={stats ? `${fmtDec(stats.s_opaque, 1)} m²` : "—"} />
      </div>
    </div>
  );
}

// ─── ImpactsTab ───────────────────────────────────────────────────────────────

const ACV2_ROWS = [
  { label: "GWP100",        gwpKey: "gwp_brut",    amKey: "gwp_amorti",    unit: "kg CO₂eq",    fmtFn: fmt },
  { label: "Énergie NR",    gwpKey: "energy_brut",  amKey: "energy_amorti", unit: "MJ",          fmtFn: fmt },
  { label: "Santé (phot.)", gwpKey: "sante_brut",   amKey: "sante_amorti",  unit: "kg NMVOC eq", fmtFn: v => fmtDec(v, 2) },
];

function ImpactsTab({ paroi, stats, dvr_batiment = 60 }) {
  const allComps = [...paroi.composantsOpaques, ...paroi.baiesVitrees];
  if (allComps.length === 0) {
    return (
      <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
        Ajoutez des composants pour voir les impacts
      </div>
    );
  }

  // Totaux ACV 2.0 via les helpers (brut + amorti)
  let totGwpBrut=0, totGwpAm=0, totEnBrut=0, totEnAm=0, totSaBrut=0, totSaAm=0;
  for (const co of paroi.composantsOpaques) {
    const r = calcComposantACV(co, dvr_batiment, stats?.s_opaque ?? 0);
    if (r.valid) {
      totGwpBrut += r.gwp_brut;    totGwpAm += r.gwp_amorti;
      totEnBrut  += r.energy_brut; totEnAm  += r.energy_amorti;
      totSaBrut  += r.sante_brut;  totSaAm  += r.sante_amorti;
    }
  }
  for (const bv of paroi.baiesVitrees) {
    const r = calcBVImpactACV(bv, dvr_batiment);
    totGwpBrut += r.gwp_brut;    totGwpAm += r.gwp_amorti;
    totEnBrut  += r.energy_brut; totEnAm  += r.energy_amorti;
    totSaBrut  += r.sante_brut;  totSaAm  += r.sante_amorti;
  }
  const totals = [
    { brut: totGwpBrut, amorti: totGwpAm },
    { brut: totEnBrut,  amorti: totEnAm  },
    { brut: totSaBrut,  amorti: totSaAm  },
  ];

  return (
    <div>
      {/* Grille résumé brut / amorti */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {ACV2_ROWS.map((row, i) => (
          <div key={row.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>{row.label}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>Brut</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: totals[i].brut != null && isFinite(totals[i].brut) ? "#374151" : "#d1d5db" }}>
                  {totals[i].brut != null && isFinite(totals[i].brut) ? row.fmtFn(totals[i].brut) : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>Amorti</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: totals[i].amorti != null && isFinite(totals[i].amorti) ? "#d97706" : "#d1d5db" }}>
                  {totals[i].amorti != null && isFinite(totals[i].amorti) ? row.fmtFn(totals[i].amorti) : "—"}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{row.unit}</div>
          </div>
        ))}
      </div>

      {/* Table détail par composant */}
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
            <th style={th}>Composant</th>
            <th style={{ ...th, minWidth: 80 }}>GWP brut</th>
            <th style={{ ...th, minWidth: 80 }}>GWP amorti</th>
            <th style={{ ...th, minWidth: 80 }}>Énergie NR brut</th>
            <th style={{ ...th, minWidth: 80 }}>Santé brut</th>
          </tr>
        </thead>
        <tbody>
          {paroi.composantsOpaques.map((co) => {
            const r = calcComposantACV(co, dvr_batiment, stats?.s_opaque ?? 0);
            return (
              <tr key={co.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>
                  {co.material_name}
                  {!r.valid && <span title={r.errorMsg} style={{ color:"#dc2626", marginLeft:4, fontSize:10, cursor:"help" }}>⚠</span>}
                </td>
                <td style={td}>{r.valid ? fmtDec(r.gwp_brut, 1) : "—"}</td>
                <td style={{ ...td, color: "#d97706" }}>{r.valid ? fmtDec(r.gwp_amorti, 1) : "—"}</td>
                <td style={td}>{r.valid ? fmtDec(r.energy_brut, 1) : "—"}</td>
                <td style={td}>{r.valid ? fmtDec(r.sante_brut, 4) : "—"}</td>
              </tr>
            );
          })}
          {paroi.baiesVitrees.map((bv) => {
            const r = calcBVImpactACV(bv, dvr_batiment);
            const label = bv.vitrage_name || bv.material_name || "BV";
            return (
              <tr key={bv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>
                  {label}
                  {!r.valid && <span title={r.errorMsg} style={{ color:"#dc2626", marginLeft:4, fontSize:10, cursor:"help" }}>⚠</span>}
                </td>
                <td style={td}>{fmtDec(r.gwp_brut, 1)}</td>
                <td style={{ ...td, color: "#d97706" }}>{fmtDec(r.gwp_amorti, 1)}</td>
                <td style={td}>{fmtDec(r.energy_brut, 1)}</td>
                <td style={td}>{fmtDec(r.sante_brut, 4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic", marginTop: 10 }}>
        L'impact amorti intègre les remplacements futurs (Module A, DVR) et la déconstruction (Module C, EN 15978) si le poids/unité est renseigné.
      </div>
    </div>
  );
}

// ─── ResultsWidget ────────────────────────────────────────────────────────────

function ResultsWidget({ bat, stats, auditKwh, onOptimize }) {
  const paroisStats = bat.parois.map((p) => ({ paroi: p, s: calcParoiStats(p, bat.dvr_batiment ?? 60) }));
  const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const dj = parseFloat(bat.degres_jours) || 1950.7;

  function paroiConso(s) {
    if (s?.dep_wk == null) return null;
    return (s.dep_wk * dj * 24) / 1000 / ch.rendement;
  }

  return (
    <div style={detailCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={cardTitle}>Impacts globaux</div>
        {onOptimize && (
          <button type="button" onClick={onOptimize}
            style={{ ...smallBtn, fontSize: 12, padding: "6px 12px" }}>
            ⚡ Optimiser
          </button>
        )}
      </div>

      {/* Âge et DVR du bâtiment */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, padding: "7px 10px", background: "#f5f3ff", borderRadius: 8, fontSize: 12 }}>
        <span style={{ color: "#6b7280" }}>
          Âge bâtiment : <strong style={{ color: "#111827" }}>
            {bat.age_batiment != null ? `${bat.age_batiment} an${bat.age_batiment !== 1 ? "s" : ""}` : "—"}
          </strong>
        </span>
        <span style={{ color: "#6b7280" }}>
          DVR : <strong style={{ color: "#111827" }}>
            {bat.dvr_batiment ?? 60} ans
          </strong>
        </span>
      </div>

      {/* Section 1 — 3 cartes métriques temps réel */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <MetricCard
          label="Coût total construction"
          value={stats.total_cout != null ? `${fmt(stats.total_cout)} €` : "—"}
          color="#059669"
        />
        <MetricCard
          label="Empreinte CO₂ construction"
          value={stats.total_gwp != null ? `${fmt(stats.total_gwp)} kg CO₂eq` : "—"}
          color="#d97706"
        />
        <MetricCard
          label="CO₂ exploitation"
          value={stats.co2_exploitation != null ? `${fmt(stats.co2_exploitation)} kg/an` : "—"}
          color="#59169c"
        />
      </div>

      {/* Section 2 — Tableau récapitulatif par paroi */}
      {paroisStats.length > 0 && (
        <>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>Récapitulatif par paroi</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
            <thead>
              <tr style={{ color: "#9ca3af", fontWeight: 600, borderBottom: "1.5px solid #f3f4f6" }}>
                <th style={th}>Paroi</th>
                <th style={{ ...th, textAlign: "right" }}>U (W/m²K)</th>
                <th style={{ ...th, textAlign: "right" }}>Dép. (W/K)</th>
                <th style={{ ...th, textAlign: "right" }}>Conso (kWh/an)</th>
                <th style={{ ...th, textAlign: "right" }}>GWP100</th>
              </tr>
            </thead>
            <tbody>
              {paroisStats.map(({ paroi, s }) => {
                const conso = paroiConso(s);
                return (
                  <tr key={paroi.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{paroi.nom}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{PAROI_TYPE_LABELS[paroi.type]}</div>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s?.u_moyen != null ? fmtDec(s.u_moyen) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s?.dep_wk != null ? fmt(s.dep_wk) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {conso != null ? fmt(conso) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s?.gwp != null ? fmt(s.gwp) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Section ACV — Brut vs Amorti */}
      <div style={{ ...sectionLabel, marginBottom: 8 }}>Indicateurs ACV</div>
      {stats.acv_errors_count > 0 && (
        <div style={{ background:"#fee2e2", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#dc2626", marginBottom:8 }}>
          ⚠ {stats.acv_errors_count} composant{stats.acv_errors_count > 1 ? "s" : ""} exclu{stats.acv_errors_count > 1 ? "s" : ""} du calcul ACV (données manquantes — DVR ou flux de référence)
        </div>
      )}
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:16 }}>
        <thead>
          <tr style={{ color:"#9ca3af", fontWeight:600, borderBottom:"1.5px solid #f3f4f6" }}>
            <th style={th}>Indicateur</th>
            <th style={{ ...th, textAlign:"right" }}>Brut</th>
            <th style={{ ...th, textAlign:"right" }}>Amorti (DVR bât. {bat.dvr_batiment ?? 60} ans)</th>
            <th style={{ ...th, textAlign:"right" }}>Unité</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label:"GWP100",        brut: stats.gwp_brut,    amorti: stats.gwp_amorti,    unit:"kg CO₂eq",    fmtFn: fmt },
            { label:"Énergie NR",    brut: stats.energy_brut, amorti: stats.energy_amorti, unit:"MJ",          fmtFn: fmt },
            { label:"Santé (phot.)", brut: stats.sante_brut,  amorti: stats.sante_amorti,  unit:"kg NMVOC eq", fmtFn: v => fmtDec(v, 2) },
          ].map(({ label, brut, amorti, unit, fmtFn }) => (
            <tr key={label} style={{ borderTop:"1px solid #f3f4f6" }}>
              <td style={{ ...td, fontWeight:600 }}>{label}</td>
              <td style={{ ...td, textAlign:"right" }}>{brut != null && isFinite(brut) ? fmtFn(brut) : "—"}</td>
              <td style={{ ...td, textAlign:"right", color: amorti != null && isFinite(amorti) ? "#d97706" : undefined, fontWeight: amorti != null && isFinite(amorti) ? 700 : 400 }}>
                {amorti != null && isFinite(amorti) ? fmtFn(amorti) : "—"}
              </td>
              <td style={{ ...td, textAlign:"right", color:"#9ca3af" }}>{unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize:11, color:"#9ca3af", fontStyle:"italic", marginBottom:16 }}>
        L'impact amorti intègre les remplacements futurs (Module A, DVR) et la déconstruction (Module C, EN 15978) si le poids/unité est renseigné.
      </div>

      {/* Section 3 — 3 cartes consommation globale avec tooltip */}
      <div style={{ ...sectionLabel, marginBottom: 8 }}>Consommation globale</div>
      <div style={{ display: "flex", gap: 8 }}>
        <TooltipCard
          label="Déperditions totales (W/K)"
          value={stats.dep_wk != null ? fmt(stats.dep_wk) : "—"}
          unit="W/K"
          tooltip="Σ(U_paroi × surface) pour toutes les parois et baies vitrées"
        />
        <TooltipCard
          label="Conso. annuelle estimée"
          value={stats.energy_kwh != null ? fmt(stats.energy_kwh) : "—"}
          unit="kWh/an"
          tooltip="Déperditions (W/K) × Degrés-jours × 24h / Rendement système"
        />
        <TooltipCard
          label="CO₂ exploitation estimé"
          value={stats.co2_exploitation != null ? fmt(stats.co2_exploitation) : "—"}
          unit="kg CO₂/an"
          tooltip="Consommation annuelle (kWh) × Facteur émission du moyen de chauffage (kg CO₂/kWh)"
        />
      </div>

      {/* Audit vs Modèle */}
      <AuditVsModele auditKwh={auditKwh} modelKwh={stats.energy_kwh} />
    </div>
  );
}

// ─── OptimisationPanel ───────────────────────────────────────────────────────

function OptimisationPanel({ bat, materials, projectId, onClose, cachedHash, cachedResult, onCacheSaved, batiments, onApplyProfile }) {
  const configHash = materials.length === 0 ? "??????" : computeConfigHash(bat, materials);

  const [phase, setPhase] = useState("init");
  const [phares, setPhares] = useState(null);
  const [computedAt, setComputedAt] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [expandedProfile, setExpandedProfile] = useState(null);
  const [fixedComponents, setFixedComponents] = useState([]);
  const [prixKwh, setPrixKwh] = useState(PRIX_KWH_BY_CHAUFFAGE[bat.moyen_chauffage] ?? 0.20);
  const isRenovation = bat.type_batiment === "renovation";

  const [budgetMax, setBudgetMax] = useState("");
  const [roiMax,    setRoiMax]    = useState("");
  const [gwpMax,    setGwpMax]    = useState("");
  const [uMoyenMax, setUMoyenMax] = useState("");
  const [epIsolantMax, setEpIsolantMax] = useState("20");
  const [rawCombos, setRawCombos] = useState(null);

  const filteredPhares = useMemo(() => {
    if (rawCombos === null) return null;
    const budgetVal = parseFloat(budgetMax);
    const roiVal    = parseFloat(roiMax);
    const gwpVal    = parseFloat(gwpMax);
    const uVal      = parseFloat(uMoyenMax);
    const epVal     = parseFloat(epIsolantMax);
    if (!isFinite(budgetVal) && !isFinite(roiVal) && !isFinite(gwpVal) && !isFinite(uVal) && !isFinite(epVal))
      return null;

    const sqSt    = calcBatimentStats(bat);
    const sqCost  = isRenovation ? 0 : (sqSt.total_cout ?? 0);
    const sqEnergy = sqSt.energy_kwh;

    const filtered = rawCombos.filter(c => {
      if (isFinite(budgetVal)) {
        const d = isRenovation ? (c.renovation_cost ?? 0) : (c.cost - sqCost);
        if (d > budgetVal) return false;
      }
      if (isFinite(roiVal)) {
        const surCout = isRenovation ? (c.renovation_cost ?? 0) : (c.cost - sqCost);
        if (surCout > 0) {
          if (sqEnergy != null && c.energy_kwh != null) {
            const econKwh = sqEnergy - c.energy_kwh;
            if (econKwh > 0) {
              if (surCout / (econKwh * prixKwh) > roiVal) return false;
            } else {
              return false; // coût supplémentaire sans économie d'énergie → ROI infini
            }
          }
        }
      }
      if (isFinite(gwpVal) && (c.gwp ?? 0) > gwpVal) return false;
      if (isFinite(uVal) && c.paroi_u_moyens?.some(u => u != null && u > uVal)) return false;
      if (isFinite(epVal) && epVal > 0 &&
          c.choices?.some(ch => ch.epaisseur_cm != null && parseFloat(ch.epaisseur_cm) > epVal)) return false;
      return true;
    });

    const mostRestrictive = (() => {
      if (filtered.length > 0) return null;
      const sqSt2   = calcBatimentStats(bat);
      const sqCost2  = isRenovation ? 0 : (sqSt2.total_cout ?? 0);
      const sqEnergy2 = sqSt2.energy_kwh;
      const counts = {
        budget:    isFinite(budgetVal) ? rawCombos.filter(c => { const d = isRenovation ? (c.renovation_cost ?? 0) : (c.cost - sqCost2); return d > budgetVal; }).length : 0,
        roi:       isFinite(roiVal)    ? rawCombos.filter(c => { const sc = isRenovation ? (c.renovation_cost ?? 0) : (c.cost - sqCost2); if (sc <= 0) return false; if (sqEnergy2 != null && c.energy_kwh != null) { const ek = sqEnergy2 - c.energy_kwh; if (ek > 0) return sc / (ek * prixKwh) > roiVal; return true; } return false; }).length : 0,
        gwp:       isFinite(gwpVal)    ? rawCombos.filter(c => (c.gwp ?? 0) > gwpVal).length : 0,
        uMoyen:    isFinite(uVal)      ? rawCombos.filter(c => c.paroi_u_moyens?.some(u => u != null && u > uVal)).length : 0,
        epIsolant: isFinite(epVal) && epVal > 0 ? rawCombos.filter(c => c.choices?.some(ch => ch.epaisseur_cm != null && parseFloat(ch.epaisseur_cm) > epVal)).length : 0,
      };
      return Object.entries(counts).reduce((best, [k, v]) => v > best[1] ? [k, v] : best, ["", -1])[0] || null;
    })();

    return { filtered, phares: computePhares(filtered, bat, materials, prixKwh), mostRestrictive };
  }, [rawCombos, budgetMax, roiMax, gwpMax, uMoyenMax, epIsolantMax, prixKwh, isRenovation, bat, materials]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (materials.length === 0) return;
    if (phase !== "init") return;
    if (cachedResult?.solutions) {
      setPhares(cachedResult.solutions);
      setFixedComponents(cachedResult.fixed_components ?? []);
      setComputedAt(cachedResult.computed_at ?? null);
      setIsStale(cachedHash !== configHash);
      setPhase("done");
      // Calcul async des combos bruts pour permettre le filtrage CSP en temps réel
      setTimeout(() => {
        const { combos } = buildCombinations(bat, materials, parseFloat(epIsolantMax) || 20);
        setRawCombos(combos);
      }, 0);
    } else {
      runCompute();
    }
  }, [materials.length, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function runCompute() {
    setPhase("computing");
    setTimeout(() => {
      const { combos, fixedDueToConstraint } = buildCombinations(bat, materials, parseFloat(epIsolantMax) || 20);
      setRawCombos(combos);
      const result = computePhares(combos, bat, materials, prixKwh);
      const now = new Date().toISOString();
      setPhares(result);
      setFixedComponents(fixedDueToConstraint);
      setComputedAt(now);
      setIsStale(false);
      setPhase("done");
      const payload = { hash: configHash, cache: { computed_at: now, solutions: result, fixed_components: fixedDueToConstraint } };
      apiFetch(`/projects/${projectId}/lca/optimisation-cache?version=v2`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(() => onCacheSaved && onCacheSaved(configHash, payload.cache));
    }, 80);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return iso; }
  }

  function calcROI(sol, sq) {
    const surCout = isRenovation ? (sol.renovation_cost ?? 0) : (sol.cost - sq.cost);
    const econKwh = (sq.energy_kwh ?? 0) - (sol.energy_kwh ?? 0);
    if (surCout > 0 && econKwh > 0)   return { type: "years",    value: surCout / (econKwh * prixKwh) };
    if (surCout <= 0 && econKwh > 0) {
      const coutTotal = isRenovation ? (sol.renovation_cost ?? 0) : (sol.cost ?? 0);
      if (coutTotal > 0) return { type: "absolute_years", value: coutTotal / (econKwh * prixKwh) };
      return { type: "immediate" };
    }
    if (surCout <= 0 && econKwh <= 0) return { type: "cheaper"                                         };
    return { type: "infinite" };
  }

  function renderROICell(roi) {
    if (roi === null) return <span style={{ color: "#9ca3af" }}>—</span>;
    if (roi.type === "years") {
      const v = roi.value;
      const c = v < 15 ? "#059669" : v <= 25 ? "#d97706" : "#dc2626";
      return <span style={{ fontWeight: 700, color: c }}>{fmtDec(v, 1)} ans</span>;
    }
    if (roi.type === "absolute_years") {
      const v = roi.value;
      const c = v < 15 ? "#059669" : v <= 25 ? "#d97706" : "#dc2626";
      return <span style={{ fontWeight: 700, color: c }}>{fmtDec(v, 1)} ans (coût total)</span>;
    }
    if (roi.type === "immediate")
      return <span style={{ fontWeight: 700, color: "#059669", fontSize: 11 }}>Économie construction + gains</span>;
    if (roi.type === "cheaper")
      return <span style={{ fontWeight: 700, color: "#059669", fontSize: 11 }}>Économie construction</span>;
    return <span style={{ fontWeight: 700, color: "#dc2626" }}>∞</span>;
  }

  // Lower is better for all metrics (cost, gwp, energy)
  function cmpColor(val, sqVal) {
    if (val == null || sqVal == null) return "#374151";
    if (val < sqVal) return "#059669";
    if (val > sqVal) return "#dc2626";
    return "#9ca3af";
  }

  function buildDetailGroups(sol) {
    const groups = [];
    for (const paroi of bat.parois) {
      if (paroi.is_fixed) continue;
      const rows = [];
      for (const co of paroi.composantsOpaques) {
        if (co.is_fixed) continue;
        const choice = sol.choices?.find(c => c.paroiId === paroi.id && c.compId === co.id && c.type === "opaque");
        const matChanged = !!(choice && choice.material_id !== co.material_id);
        const rChosenF = choice?.r_cible != null ? parseFloat(choice.r_cible) : null;
        const rOrigF   = co.r_cible      != null ? parseFloat(co.r_cible)     : null;
        const rIncreased = isIsolantCategory(co.category) && rChosenF != null && rOrigF != null && rChosenF > rOrigF + 0.01;
        const changed = matChanged || rIncreased;
        rows.push({
          original:           co.material_name,
          chosen:             matChanged ? choice.material_name : null,
          changed,
          originalEfficacite: parseFloat(co.efficacite) || 100,
          isIsolant:          isIsolantCategory(co.category),
          sameMatDiffR:       !matChanged && rIncreased,
          origR:              rOrigF,
          chosenR:            rChosenF,
          chosenEp:           choice?.epaisseur_cm != null ? parseFloat(choice.epaisseur_cm) : null,
        });
      }
      for (const bv of paroi.baiesVitrees) {
        if (bv.is_fixed) continue;
        const choiceVit = sol.choices?.find(c => c.paroiId === paroi.id && c.compId === bv.id && c.type === "vitree_vitrage");
        const choiceCad = sol.choices?.find(c => c.paroiId === paroi.id && c.compId === bv.id && c.type === "vitree_cadre");
        // Compat legacy : choices de type "vitree" (anciens caches)
        const choiceLegacy = sol.choices?.find(c => c.paroiId === paroi.id && c.compId === bv.id && c.type === "vitree");
        const changedVit = !!(choiceVit && choiceVit.material_id !== bv.material_id) || !!(choiceLegacy && choiceLegacy.material_id !== bv.material_id);
        const changedCad = !!(choiceCad && choiceCad.material_id !== (bv.cadre_id ?? null));
        const chosenVitName = changedVit ? (choiceVit?.material_name ?? choiceLegacy?.material_name) : null;
        const chosenCadName = changedCad ? choiceCad?.material_name : null;
        rows.push({
          original: bv.vitrage_name ?? bv.material_name,
          originalCadre: bv.cadre_name ?? null,
          chosen: chosenVitName,
          chosenCadre: chosenCadName,
          changed: changedVit || changedCad,
          originalEfficacite: parseFloat(bv.efficacite) || 100,
        });
      }
      for (const choice of (sol.choices || [])) {
        if (!choice.isAdded || choice.is_noop || choice.paroiId !== paroi.id) continue;
        const chosenR = choice.r_cible != null ? parseFloat(choice.r_cible) : null;
        const chosenEp = choice.epaisseur_cm != null ? parseFloat(choice.epaisseur_cm) : null;
        rows.push({ isAddedIsolant: true, chosen: choice.material_name, chosenR, chosenEp, changed: true });
      }
      if (rows.length > 0) groups.push({ paroiNom: paroi.nom, rows });
    }
    return groups;
  }

  function applyProfile(sol) {
    const existingOptCount = (batiments || []).filter(b => /^Optimisation \d+$/.test(b.nom)).length;
    const newNum = existingOptCount + 1;
    const newBat = JSON.parse(JSON.stringify(bat));
    newBat.id = newId();
    newBat.nom = `Optimisation ${newNum}`;
    for (const choice of (sol.choices || [])) {
      for (const paroi of newBat.parois) {
        if (paroi.id !== choice.paroiId) continue;
        if (choice.type === "opaque") {
          if (choice.isAdded) {
            if (!choice.is_noop && choice.material_id !== null) {
              const mat = materials.find(m => m.id === choice.material_id);
              if (mat) {
                paroi.composantsOpaques.push({
                  id:             newId(),
                  material_id:    mat.id,
                  material_name:  mat.name,
                  category:       "Isolant",
                  r_cible:        choice.r_cible != null ? String(choice.r_cible) : "",
                  epaisseur_cm:   choice.epaisseur_cm != null ? String(choice.epaisseur_cm) : "",
                  surface_m2:     paroi.surface_totale,
                  efficacite:     100,
                  flux_reference: mat.flux_reference ?? null,
                  dvr_materiau:   mat.dvr_materiau ?? null,
                  impacts:        mat.impacts || {},
                  prix_unit:      parseFloat(mat.prix) || 0,
                  lambda_lib:     getLambda(mat) ?? parseFloat(mat.valeur_r) ?? null,
                  r_local:        "",
                  lambda_local:   "",
                  is_added_by_optimisation: true,
                });
              }
            }
          } else {
          for (let i = 0; i < paroi.composantsOpaques.length; i++) {
            if (paroi.composantsOpaques[i].id !== choice.compId) continue;
            const mat = materials.find(m => m.id === choice.material_id);
            if (mat) {
              const isIso = isIsolantCategory(mat.category);
              paroi.composantsOpaques[i] = {
                ...paroi.composantsOpaques[i],
                material_id:    mat.id,
                material_name:  mat.name,
                lambda_lib:     parseFloat(mat.valeur_r) ?? null,
                lambda_local:   "",
                r_local:        "",
                ...(isIso && choice.r_cible      != null ? { r_cible:      String(choice.r_cible)      } : {}),
                ...(isIso && choice.epaisseur_cm != null ? { epaisseur_cm: String(choice.epaisseur_cm) } : {}),
                prix_unit:      parseFloat(mat.prix) || 0,
                gwp100_unit:    extractImpact(mat.impacts, "gwp100", "gwp_100") || 0,
                impacts:        mat.impacts || {},
                dvr_materiau:   mat.dvr_materiau ?? null,
                flux_reference: mat.flux_reference ?? null,
                poids_unite:    mat.poids_unite ?? null,
              };
            }
          }
          } // fin else isAdded
        } else if (choice.type === "vitree_vitrage" || choice.type === "vitree") {
          for (let i = 0; i < paroi.baiesVitrees.length; i++) {
            if (paroi.baiesVitrees[i].id !== choice.compId) continue;
            const mat = materials.find(m => m.id === choice.material_id);
            if (mat) {
              paroi.baiesVitrees[i] = {
                ...paroi.baiesVitrees[i],
                material_id:          mat.id,
                material_name:        mat.name,
                valeur_r_vitrage:     parseFloat(mat.valeur_r) || 0,
                prix_unit_vitrage:    parseFloat(mat.prix) || 0,
                gwp100_unit_vitrage:  extractImpact(mat.impacts, "gwp100", "gwp_100") || 0,
                impacts:              mat.impacts || {},
                dvr_materiau_vitrage: mat.dvr_materiau ?? null,
                poids_unite_vitrage:  mat.poids_unite ?? null,
              };
            }
          }
        } else if (choice.type === "vitree_cadre") {
          for (let i = 0; i < paroi.baiesVitrees.length; i++) {
            if (paroi.baiesVitrees[i].id !== choice.compId) continue;
            const mat = materials.find(m => m.id === choice.material_id);
            if (mat) {
              paroi.baiesVitrees[i] = {
                ...paroi.baiesVitrees[i],
                cadre_id:            mat.id,
                cadre_name:          mat.name,
                valeur_r_cadre:      parseFloat(mat.valeur_r) || null,
                dvr_materiau_cadre:  mat.dvr_materiau ?? null,
                poids_unite_cadre:   mat.poids_unite ?? null,
                impacts_cadre:       mat.impacts || {},
                prix_unit_cadre:     parseFloat(mat.prix) || 0,
              };
            }
          }
        }
      }
    }
    onApplyProfile(newBat);
  }

  const PHARE_DEFS = [
    { key: "statuQuo",   label: "Statu quo",    color: "#6b7280", icon: "○" },
    { key: "economique", label: "Maximum économique", color: "#059669", icon: "💰" },
    { key: "ecologique", label: "Écologique",   color: "#16a34a", icon: "🌿" },
    { key: "roi",        label: "Meilleur ROI", color: "#2563eb", icon: "↩" },
    { key: "topsis2",    label: "TOPSIS",                        color: "#7c3aed", icon: "✨" },
  ];

  const ALL_PHARE_KEYS = ["statuQuo", "economique", "ecologique", "roi", "topsis2"];

  // Quand des filtres CSP sont actifs et les combos bruts disponibles, on utilise les phares filtrés
  const displayPhares = (filteredPhares != null && filteredPhares.filtered.length > 0)
    ? filteredPhares.phares
    : phares;

  const hasSanteInLibrary = materials.some(m => { const v = extractImpact(m?.impacts, "photochemical_oxidant_hh", "photochemical_oxidant"); return v != null && isFinite(v) && v !== 0; });
  const noSanteData = !hasSanteInLibrary;
  const santeMissingDVR = hasSanteInLibrary && (displayPhares == null || ALL_PHARE_KEYS.every(k => !(displayPhares[k]?.sante_amorti > 0)));

  const allDominatedOrEqual = !isRenovation && displayPhares != null && displayPhares.statuQuo != null &&
    ["economique", "ecologique", "roi", "topsis2"].every(k => {
      const s = displayPhares[k];
      if (!s) return true;
      const sq = displayPhares.statuQuo;
      return (s.cost == null || sq.cost == null || s.cost >= sq.cost) &&
             (s.gwp  == null || sq.gwp  == null || s.gwp  >= sq.gwp ) &&
             (s.energy_kwh == null || sq.energy_kwh == null || s.energy_kwh >= sq.energy_kwh);
    });

  const FILTER_LABELS = {
    budget:    "Budget max (Δcoût)",
    roi:       "ROI max (ans)",
    gwp:       "GWP100 max (kg CO₂eq)",
    uMoyen:    "U_moyen max (W/m²K)",
    epIsolant: "Épaisseur isolant max (cm)",
  };

  const ecoFactor = (CHAUFFAGE_OPTIONS.find(o => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0]).co2;
  const co2Total  = sol => sol?.energy_kwh != null ? (sol.gwp_amorti ?? 0) / (bat.dvr_batiment ?? 60) + sol.energy_kwh * ecoFactor : null;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 950 }} onClick={onClose} />
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: "58%", minWidth: 520,
        background: "white", zIndex: 951,
        boxShadow: "-6px 0 32px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>Optimisation — {bat.nom}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Config #{configHash}</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...tinyIconBtn, color: "#6b7280", padding: "5px" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* ── Panneau Filtres CSP ────────────────────────────────────────── */}
          <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Filtres
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Budget max (€)</label>
                <input
                  type="number" min="0" step="100"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="ex : 5000"
                  style={{ width: 100, fontSize: 12, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>ROI max (ans)</label>
                <input
                  type="number" min="0" step="1"
                  value={roiMax}
                  onChange={(e) => setRoiMax(e.target.value)}
                  placeholder="ex : 15"
                  style={{ width: 100, fontSize: 12, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>GWP100 max (kg CO₂eq)</label>
                <input
                  type="number" min="0" step="100"
                  value={gwpMax}
                  onChange={(e) => setGwpMax(e.target.value)}
                  placeholder="ex : 10000"
                  style={{ width: 130, fontSize: 12, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>U_moyen max (W/m²K)</label>
                <input
                  type="number" min="0" step="0.1"
                  value={uMoyenMax}
                  onChange={(e) => setUMoyenMax(e.target.value)}
                  placeholder="ex : 0.5"
                  style={{ width: 120, fontSize: 12, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Épaisseur isolant max (cm)</label>
                <input
                  type="number" min="2.5" step="2.5"
                  value={epIsolantMax}
                  onChange={(e) => setEpIsolantMax(e.target.value)}
                  placeholder="ex : 20"
                  style={{ width: 110, fontSize: 12, padding: "4px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </div>
            </div>
            {rawCombos === null && (budgetMax || roiMax || gwpMax || uMoyenMax) && (
              <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic", marginTop: 8 }}>
                Calcul en cours pour activer les filtres…
              </div>
            )}
          </div>

          {materials.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 13 }}>
              Chargement de la bibliothèque…
            </div>
          )}

          {phase === "computing" && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Calcul en cours…</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Génération et tri des combinaisons</div>
            </div>
          )}

          {phase === "done" && phares && (
            <>
              {isStale && (
                <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 4 }}>
                    ⚠️ La configuration a changé depuis la dernière optimisation
                  </div>
                  {computedAt && (
                    <div style={{ fontSize: 12, color: "#b45309", marginBottom: 10 }}>
                      Voici les anciens résultats du {fmtDate(computedAt)}
                    </div>
                  )}
                  <button type="button" onClick={runCompute}
                    style={{ ...primaryBtn, fontSize: 13, padding: "8px 14px" }}>
                    Mettre à jour l'optimisation
                  </button>
                </div>
              )}

              {!isStale && computedAt && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                    Résultats du {fmtDate(computedAt)}
                  </div>
                  <button type="button" onClick={runCompute} style={{ ...smallBtn, fontSize: 11 }}>
                    Recalculer
                  </button>
                </div>
              )}

              {filteredPhares != null && filteredPhares.filtered.length === 0 && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#8f1d2f", marginBottom: filteredPhares.mostRestrictive ? 4 : 0 }}>
                    Aucune solution ne satisfait ces contraintes — essayez d'assouplir vos critères
                  </div>
                  {filteredPhares.mostRestrictive && (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>
                      Filtre le plus restrictif : {FILTER_LABELS[filteredPhares.mostRestrictive]}
                    </div>
                  )}
                </div>
              )}

              {allDominatedOrEqual && (
                <div style={{ textAlign: "center", padding: "16px 20px", marginBottom: 14, background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 10 }}>
                  <div style={{ fontSize: 16, marginBottom: 6 }}>✓</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
                    Votre configuration actuelle est déjà optimale
                  </div>
                  <div style={{ fontSize: 12, color: "#15803d" }}>
                    Aucune alternative disponible dans la bibliothèque ne propose un meilleur compromis coût / impact environnemental / consommation énergétique.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Prix énergie (€/kWh)</span>
                <input
                  type="number" step="0.01" min="0"
                  value={prixKwh}
                  onChange={(e) => setPrixKwh(parseFloat(e.target.value) || 0)}
                  style={{ width: 70, fontSize: 12, padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  ({CHAUFFAGE_OPTIONS.find(o => o.id === bat.moyen_chauffage)?.label ?? bat.moyen_chauffage})
                </span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#9ca3af", fontWeight: 600, borderBottom: "1.5px solid #f3f4f6" }}>
                      <th style={{ ...th, minWidth: 110 }}>Profil</th>
                      <th style={{ ...th, textAlign: "right" }}>Coût différentiel (€)</th>
                      <th style={{ ...th, textAlign: "right" }}>GWP100 (kg)</th>
                      <th style={{ ...th, textAlign: "right" }}>Énergie (kWh/an)</th>
                      <th style={{ ...th, textAlign: "right" }} title="GWP construction / 30 ans + CO₂ exploitation annuel (kg CO₂eq/an)">CO₂ total (kg/an)</th>
                      <th style={{ ...th, textAlign: "right" }} title="Économies annuelles sur la facture énergétique">Économies (€/an)</th>
                      <th style={{ ...th, textAlign: "right" }} title="Réduction des émissions CO₂ liées à l'exploitation annuelle">Économies CO₂/an (kg)</th>
                      <th style={{ ...th, textAlign: "right" }}>ROI (ans)</th>
                      <th style={{ ...th, textAlign: "right" }} title="Santé humaine — photochemical_oxidant_hh amorti (kg NMVOC eq)">Santé humaine (kg NMVOC eq)</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {PHARE_DEFS.map(({ key, label, color, icon }) => {
                      if (allDominatedOrEqual && key !== "statuQuo") return null;
                      const sol = displayPhares[key];
                      const isExpanded = expandedProfile === key;
                      if (!sol) return (
                        <tr key={key} style={{ borderTop: "1px solid #f3f4f6", opacity: 0.4 }}>
                          <td style={td} colSpan={10}>
                            <span style={{ fontWeight: 600, color: "#9ca3af" }}>{icon} {label}</span>
                            <span style={{ color: "#d1d5db", marginLeft: 8, fontSize: 11 }}>Non disponible</span>
                          </td>
                        </tr>
                      );
                      const sq = displayPhares.statuQuo;
                      const roi = key === "statuQuo" ? null : calcROI(sol, sq);
                      const econKwh = key === "statuQuo" ? null
                        : (sq.energy_kwh != null && sol.energy_kwh != null)
                          ? sq.energy_kwh - sol.energy_kwh : null;
                      const detailGroups = buildDetailGroups(sol);
                      return (
                        <Fragment key={key}>
                          <tr
                            onClick={() => setExpandedProfile(isExpanded ? null : key)}
                            style={{
                              borderTop: "1px solid #f3f4f6",
                              background: isExpanded ? color + "12" : (isStale ? "#f9fafb" : "white"),
                              cursor: "pointer",
                              opacity: isStale ? 0.75 : 1,
                            }}
                          >
                            <td style={{ ...td, fontWeight: 700, color }}>
                              <span style={{ marginRight: 4, fontSize: 10, verticalAlign: "middle" }}>
                                {isExpanded ? "▼" : "▶"}
                              </span>
                              {icon} {label}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                              {(() => {
                                const d = isRenovation
                                  ? (key === "statuQuo" ? 0 : (sol.renovation_cost ?? 0))
                                  : (sol.cost - sq.cost);
                                if (d > 0) return <span style={{ color: "#dc2626" }}>+{fmt(d)} €</span>;
                                if (d < 0) return <span style={{ color: "#059669" }}>Économie construction : {fmt(Math.abs(d))} €</span>;
                                return <span style={{ color: "#9ca3af" }}>0 €</span>;
                              })()}
                            </td>
                            <td style={{ ...td, textAlign: "right", color: key === "statuQuo" ? "#374151" : cmpColor(sol.gwp, sq.gwp) }}>{fmt(sol.gwp)}</td>
                            <td style={{ ...td, textAlign: "right", color: key === "statuQuo" ? "#374151" : cmpColor(sol.energy_kwh, sq.energy_kwh) }}>{sol.energy_kwh != null ? fmt(sol.energy_kwh) : "—"}</td>
                            <td style={{ ...td, textAlign: "right", color: key === "statuQuo" ? "#374151" : cmpColor(co2Total(sol), co2Total(sq)) }}>
                              {co2Total(sol) != null ? fmt(co2Total(sol)) : "—"}
                            </td>
                            {(() => {
                              const econEur = econKwh != null ? econKwh * prixKwh : null;
                              return (
                                <td style={{ ...td, textAlign: "right", fontWeight: 600, color: econEur != null && econEur > 0 ? "#059669" : (econEur != null && econEur < 0 ? "#dc2626" : "#9ca3af") }}>
                                  {econEur != null ? (econEur >= 0 ? "+" : "") + fmtDec(econEur, 1) : "—"}
                                </td>
                              );
                            })()}
                            {(() => {
                              const econCo2 = (sq.energy_kwh != null && sol.energy_kwh != null)
                                ? (sq.energy_kwh - sol.energy_kwh) * ecoFactor : null;
                              const c = econCo2 != null && econCo2 > 0 ? "#059669" : (econCo2 != null && econCo2 < 0 ? "#dc2626" : "#9ca3af");
                              return (
                                <td style={{ ...td, textAlign: "right", fontWeight: 600, color: key === "statuQuo" ? "#9ca3af" : c }}>
                                  {econCo2 != null ? (key === "statuQuo" ? "—" : (econCo2 >= 0 ? "+" : "") + fmtDec(econCo2, 1)) : "—"}
                                </td>
                              );
                            })()}
                            <td style={{ ...td, textAlign: "right" }}>
                              {renderROICell(roi)}
                            </td>
                            <td style={{ ...td, textAlign: "right", color: key === "statuQuo" ? "#374151" : cmpColor(sol.sante_amorti, displayPhares.statuQuo?.sante_amorti) }}>
                              {noSanteData
                                ? <span style={{ color: "#d1d5db", fontSize: 10 }}>n/d</span>
                                : fmtDec(sol.sante_amorti, 2)}
                            </td>
                            <td style={td}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); applyProfile(sol); }}
                                style={{ ...smallBtn, fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap" }}
                              >
                                Appliquer
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr style={{ background: color + "08" }}>
                              <td colSpan={10} style={{ padding: "10px 16px 14px" }}>
                                {key !== "statuQuo" && (() => {
                                  const warnings = [];
                                  if (sol.gwp != null && sq.gwp != null && sol.gwp > sq.gwp)
                                    warnings.push("GWP100 (empreinte CO₂ construction)");
                                  if (sol.energy_kwh != null && sq.energy_kwh != null && sol.energy_kwh > sq.energy_kwh)
                                    warnings.push("Consommation énergétique annuelle");
                                  if (warnings.length === 0) return null;
                                  return (
                                    <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                                      {warnings.map((w, i) => (
                                        <div key={i} style={{ fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: i < warnings.length - 1 ? 4 : 0 }}>
                                          ⚠️ {w} : cet indicateur est moins bon que la configuration actuelle
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                                  Matériaux utilisés
                                </div>
                                {detailGroups.length === 0 ? (
                                  <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>Aucun composant modifiable</div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {detailGroups.map((group, gi) => (
                                      <div key={gi}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 4 }}>{group.paroiNom}</div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 10 }}>
                                          {group.rows.map((row, ri) => (
                                            <div key={ri} style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
                                              {row.isAddedIsolant ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                                  <span style={{ fontWeight: 700, color: "#f97316", background: "#fff7ed", padding: "1px 6px", borderRadius: 4 }}>
                                                    [+ Ajout] {row.chosen}
                                                    {row.chosenEp != null && row.chosenR != null && (
                                                      <span style={{ fontWeight: 500, marginLeft: 6 }}>
                                                        — {row.chosenEp} cm — R = {row.chosenR.toFixed(2)} m²·K/W
                                                      </span>
                                                    )}
                                                  </span>
                                                </div>
                                              ) : (
                                                <>
                                                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                                    {row.changed ? (
                                                      <>
                                                        <span style={{ color: "#9ca3af", textDecoration: "line-through" }}>
                                                          {row.original}{row.originalCadre ? ` + ${row.originalCadre}` : ""}
                                                        </span>
                                                        <span style={{ color: "#6b7280" }}>→</span>
                                                        <span style={{ fontWeight: 700, color, background: color + "18", padding: "1px 6px", borderRadius: 4 }}>
                                                          {row.sameMatDiffR
                                                            ? `${row.original} — épaisseur augmentée`
                                                            : `${row.chosen ?? row.original}${row.chosenCadre ? ` + ${row.chosenCadre}` : (row.originalCadre ? ` + ${row.originalCadre}` : "")}`
                                                          }
                                                          {row.isIsolant && row.chosenEp != null && row.chosenR != null && (
                                                            <span style={{ fontWeight: 500, marginLeft: 6 }}>
                                                              — {row.chosenEp} cm — R = {row.chosenR.toFixed(2)} m²·K/W
                                                            </span>
                                                          )}
                                                        </span>
                                                      </>
                                                    ) : (
                                                      <span style={{ color: "#9ca3af", fontStyle: "italic" }}>{row.original} — inchangé</span>
                                                    )}
                                                  </div>
                                                  <div style={{ fontSize: 10, color: row.changed ? "#059669" : (row.originalEfficacite < 100 ? "#dc2626" : "#9ca3af"), paddingLeft: 2 }}>
                                                    {row.changed
                                                      ? <>Remplacement — efficacité 100% (neuf){row.originalEfficacite < 100 && <span style={{ color: "#d97706", marginLeft: 4 }}>était {row.originalEfficacite}%</span>}</>
                                                      : (row.originalEfficacite < 100 ? `Efficacité actuelle : ${row.originalEfficacite}%` : "Efficacité : 100%")
                                                    }
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {noSanteData && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                  ℹ️ Données photochemical_oxidant_hh insuffisantes dans la bibliothèque — indicateur Santé humaine non disponible.
                </div>
              )}
              {santeMissingDVR && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#d97706", fontStyle: "italic" }}>
                  ℹ️ Données santé présentes — vérifier les DVR matériaux (sante_amorti = 0 pour tous les profils).
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                Le profil Écologique minimise GWP_amorti + CO₂_exploitation × DVR_bâtiment. La sélection TOPSIS utilise les impacts amortis (GWP, Énergie NR, Santé humaine) à poids égal.
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function PhareMetric({ label, value, delta, good }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{value}</div>
      {delta != null && (
        <div style={{ fontSize: 11, fontWeight: 600, color: good ? "#059669" : "#dc2626" }}>{delta}</div>
      )}
    </div>
  );
}

// ─── AuditVsModele ────────────────────────────────────────────────────────────

function AuditVsModele({ auditKwh, modelKwh }) {
  const hasAudit = auditKwh != null;
  const hasModel = modelKwh != null;

  let ecart = null;
  let ecartColor = "#374151";
  if (hasAudit && hasModel && auditKwh > 0) {
    ecart = ((modelKwh - auditKwh) / auditKwh) * 100;
    const abs = Math.abs(ecart);
    ecartColor = abs < 15 ? "#059669" : abs < 30 ? "#d97706" : "#dc2626";
  }

  return (
    <div style={{ ...detailCard, marginTop: 14 }}>
      <div style={cardTitle}>Consommation audit vs modèle</div>
      {!hasAudit ? (
        <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>
          Aucune donnée audit disponible pour ce projet
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 0", fontWeight: 600, color: "#374151" }}>Consommation réelle</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#111827" }}>{fmt(auditKwh)} kWh/an</td>
                <td style={{ textAlign: "right", paddingLeft: 10, fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>Audit AMUREBA</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 0", fontWeight: 600, color: "#374151" }}>Consommation estimée</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#111827" }}>
                  {hasModel ? `${fmt(modelKwh)} kWh/an` : "—"}
                </td>
                <td style={{ textAlign: "right", paddingLeft: 10, fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>Modèle ACV</td>
              </tr>
              {ecart != null && (
                <tr>
                  <td style={{ padding: "6px 0", fontWeight: 600, color: "#374151" }}>Écart</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: ecartColor }}>
                    {ecart > 0 ? "+" : ""}{ecart.toFixed(1)} %
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>
            Un écart important peut indiquer des hypothèses à affiner : degrés-jours, rendement système ou température cible.
          </div>
        </>
      )}
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, color }) {
  const missing = value === "—";
  return (
    <div style={{ flex: 1, background: "#f9fafb", borderRadius: 10, padding: "12px 10px" }}>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: missing ? "#d1d5db" : color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// ─── TooltipCard ──────────────────────────────────────────────────────────────

function TooltipCard({ label, value, unit, tooltip }) {
  const [hovered, setHovered] = useState(false);
  const missing = value === "—";
  return (
    <div
      style={{ position: "relative", flex: 1, background: "#f9fafb", borderRadius: 10, padding: "12px 10px", cursor: "default" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && tooltip && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 7px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#1f2937", color: "white", fontSize: 11, fontWeight: 500,
          padding: "7px 10px", borderRadius: 8, lineHeight: 1.45,
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)", zIndex: 20,
          width: 200, textAlign: "center", pointerEvents: "none",
        }}>
          {tooltip}
          <div style={{
            position: "absolute", top: "100%", left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1f2937",
          }} />
        </div>
      )}
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: missing ? "#d1d5db" : "#59169c" }}>{value}</div>
      {!missing && unit && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

// ─── BaieVitreeModal ─────────────────────────────────────────────────────────

function BaieVitreeModal({ materials, form, setForm, onConfirm, onClose }) {
  const vitrages = materials.filter((m) => isFenetreCategory(m.category || ""));
  const cadres   = materials.filter((m) => isCadreCategory(m.category || ""));
  const vitMat   = materials.find((m) => m.id === form.vitrage_id) || null;
  const cadreMat = form.cadre_id ? materials.find((m) => m.id === form.cadre_id) : null;

  const rV = parseFloat(form.r_vitrage_local) > 0 ? parseFloat(form.r_vitrage_local) : parseFloat(vitMat?.valeur_r);
  const rC = parseFloat(form.r_cadre_local)  > 0 ? parseFloat(form.r_cadre_local)  : parseFloat(cadreMat?.valeur_r);
  const sv = parseFloat(form.s_vitrage_unit) || 0;
  const sc = parseFloat(form.s_cadre_unit) || 0;
  const sTot = sv + sc;
  let rPreview = null;
  if (isFinite(rV) && rV > 0 && sTot > 0) {
    const uaV = sv > 0 ? sv / rV : 0;
    const uaC = isFinite(rC) && rC > 0 && sc > 0 ? sc / rC : 0;
    rPreview = sTot / (uaV + uaC);
  }

  const canSubmit = form.vitrage_id && parseFloat(form.quantite) > 0 && sv > 0;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 900 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "white", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        padding: "24px 28px", minWidth: 400, maxWidth: 520, zIndex: 901,
      }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Ajouter une baie vitrée</div>

        <Field label="Vitrage *">
          <select value={form.vitrage_id} onChange={(e) => setForm((f) => ({ ...f, vitrage_id: e.target.value }))} style={inputStyle}>
            <option value="">— choisir —</option>
            {vitrages.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        {vitMat && (
          <div style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 10px" }}>
            R vitrage lib. : {vitMat.valeur_r != null ? fmtDec(vitMat.valeur_r, 3) : "—"} m²K/W
          </div>
        )}

        <Field label="Cadre (optionnel)">
          <select value={form.cadre_id} onChange={(e) => setForm((f) => ({ ...f, cadre_id: e.target.value, s_cadre_unit: "", r_cadre_local: "" }))} style={inputStyle}>
            <option value="">— aucun —</option>
            {cadres.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        {cadreMat && (
          <div style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 10px" }}>
            R cadre lib. : {cadreMat.valeur_r != null ? fmtDec(cadreMat.valeur_r, 3) : "—"} m²K/W
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <Field label="Quantité">
            <input type="number" min="1" value={form.quantite}
              onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
              style={inputStyle} autoFocus />
          </Field>
          <Field label="S vitrage / unité (m²)">
            <input type="number" min="0" step="any" value={form.s_vitrage_unit}
              onChange={(e) => setForm((f) => ({ ...f, s_vitrage_unit: e.target.value }))}
              style={inputStyle} placeholder="ex : 1.2" />
          </Field>
          {form.cadre_id && (
            <Field label="S cadre / unité (m²)">
              <input type="number" min="0" step="any" value={form.s_cadre_unit}
                onChange={(e) => setForm((f) => ({ ...f, s_cadre_unit: e.target.value }))}
                style={inputStyle} placeholder="ex : 0.3" />
            </Field>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
          {vitMat && (
            <Field label="R vitrage (surcharge, m²K/W)">
              <input type="number" min="0" step="any"
                value={form.r_vitrage_local ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, r_vitrage_local: e.target.value }))}
                style={{ ...inputStyle, ...(parseFloat(form.r_vitrage_local) > 0 ? { color: "#2563eb" } : {}) }}
                placeholder={vitMat.valeur_r != null ? fmtDec(vitMat.valeur_r, 3) : "—"} />
            </Field>
          )}
          {cadreMat && (
            <Field label="R cadre (surcharge, m²K/W)">
              <input type="number" min="0" step="any"
                value={form.r_cadre_local ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, r_cadre_local: e.target.value }))}
                style={{ ...inputStyle, ...(parseFloat(form.r_cadre_local) > 0 ? { color: "#2563eb" } : {}) }}
                placeholder={cadreMat.valeur_r != null ? fmtDec(cadreMat.valeur_r, 3) : "—"} />
            </Field>
          )}
        </div>

        {rPreview != null && (
          <div style={{ background: "#f5f3ff", borderRadius: 8, padding: "8px 12px", marginTop: 12, fontSize: 13 }}>
            R fenêtre combiné : <strong>{fmtDec(rPreview, 3)} m²K/W</strong>
            {" "}(U = {fmtDec(1 / rPreview, 3)} W/m²K)
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Annuler
          </button>
          <button type="button" disabled={!canSubmit} onClick={onConfirm}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: canSubmit ? "#59169c" : "#e5e7eb", color: canSubmit ? "white" : "#9ca3af", fontWeight: 600, fontSize: 13, cursor: canSubmit ? "pointer" : "not-allowed" }}>
            Ajouter
          </button>
        </div>
      </div>
    </>
  );
}

// ─── MaterialSidePanel ────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["Mur", "Isolant", "Fenêtre", "Toiture", "Plancher", "Cloison", "Cadre", "Autre"];
const OPAQUE_CATS = new Set(["Mur", "Toiture", "Plancher", "Cloison", "Cadre"]);

const PANEL_TITLES = {
  add_opaque:      "Composant opaque",
  replace_opaque:  "Remplacer le matériau",
  replace_vitrage: "Remplacer le vitrage",
  replace_cadre:   "Remplacer le cadre",
};

function MaterialSidePanel({ modal, form, setForm, materials, onConfirm, onClose }) {
  const mode = modal.mode || "add_opaque";
  const [search, setSearch] = useState("");

  const filtered = materials.filter((m) => {
    const cat = m.category || "Autre";
    const matchSearch = !search.trim() || m.name.toLowerCase().includes(search.toLowerCase());
    if (mode === "replace_vitrage") return isFenetreCategory(cat) && matchSearch;
    if (mode === "replace_cadre")   return isCadreCategory(cat)   && matchSearch;
    // add_opaque / replace_opaque : exclure fenêtre, cadre, vitrage
    return !isFenetreCategory(cat) && !isCadreCategory(cat) && normStr(cat) !== "vitrage" && matchSearch;
  });

  // Group by category, sorted per CATEGORY_ORDER then alphabetically
  const groups = {};
  for (const m of filtered) {
    const raw = (m.category || "Autre").trim();
    const cat = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }
  const sortedCats = Object.keys(groups).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const initialCat = (() => {
    if (modal.currentCat) {
      const raw = (modal.currentCat || "").trim();
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    if (mode === "replace_vitrage") return "Fenêtre";
    if (mode === "replace_cadre")   return "Cadre";
    return null;
  })();
  const [openCat, setOpenCat] = useState(initialCat);

  function toggleCat(cat) {
    setOpenCat((prev) => (prev === cat ? null : cat));
  }

  const selectedMat = materials.find((m) => m.id === form.material_id) || null;

  function selectMat(m) {
    if (mode !== "add_opaque") {
      onConfirm(m);
      return;
    }
    setForm((f) => ({
      ...f,
      material_id: m.id,
      lambda_custom: "",
      r_custom: "",
      unite_autre: "",
    }));
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 900 }}
        onClick={onClose}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: "35%", minWidth: 320,
        background: "white", zIndex: 901,
        boxShadow: "-6px 0 32px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>
            {PANEL_TITLES[mode] || "Composant opaque"}
          </div>
          <button type="button" onClick={onClose} style={{ ...tinyIconBtn, color: "#6b7280", padding: "5px" }}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
          <input
            type="text" autoFocus
            placeholder="Rechercher un matériau…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, fontSize: 13 }}
          />
        </div>

        {/* Scrollable material list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
          {sortedCats.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
              Aucun matériau compatible
            </div>
          )}
          {sortedCats.map((cat) => {
            const isOpen = openCat === cat;
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                {/* Accordion header */}
                <button
                  type="button"
                  onClick={() => toggleCat(cat)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px", borderRadius: 8,
                    border: "1.5px solid #e5e7eb",
                    background: isOpen ? "#f5f3ff" : "#f9fafb",
                    cursor: "pointer",
                    fontSize: 12, fontWeight: 700,
                    color: isOpen ? "#59169c" : "#374151",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    marginBottom: isOpen ? 4 : 0,
                  }}
                >
                  <span>{cat}</span>
                  <span style={{ fontSize: 11, color: isOpen ? "#59169c" : "#9ca3af" }}>
                    {isOpen ? "▼" : "▶"}
                  </span>
                </button>

                {/* Accordion body */}
                {isOpen && groups[cat].map((m) => {
                  const isSelected = form.material_id === m.id;
                  const gwp = extractImpact(m.impacts, "gwp100", "gwp_100");
                  return (
                    <div
                      key={m.id}
                      onClick={() => selectMat(m)}
                      style={{
                        padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 3,
                        background: isSelected ? "#f5f3ff" : "transparent",
                        border: `1.5px solid ${isSelected ? "#8b5cf6" : "transparent"}`,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#fafafa"; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{m.name}</span>
                        {m.valeur_r == null && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 4, padding: "1px 5px" }}>
                            R manquant
                          </span>
                        )}
                      </div>
                      {m.unit && (
                        <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic", marginTop: 1 }}>{m.unit}</div>
                      )}
                      <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                        {m.valeur_r != null && (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>λ/R {m.valeur_r}</span>
                        )}
                        {m.prix != null && (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{m.prix} €/u</span>
                        )}
                        {gwp != null && (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>GWP {fmtDec(gwp, 1)} kg CO₂eq</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Inline form — visible only in add_opaque mode when a material is selected */}
        {mode === "add_opaque" && selectedMat && (
          <InlineCompForm
            selectedMat={selectedMat}
            form={form}
            setForm={setForm}
            onConfirm={onConfirm}
          />
        )}
      </div>
    </>
  );
}

// ─── InlineCompForm ───────────────────────────────────────────────────────────

function InlineCompForm({ selectedMat, form, setForm, onConfirm }) {
  const cat = selectedMat.category || "Autre";
  const isFenetre = isFenetreCategory(cat);
  const isOpaque = OPAQUE_CATS.has(cat) || (!isFenetreCategory(cat) && cat !== "Autre");

  // For opaque: R = ep / (lambda * 100)
  const lambdaVal = form.lambda_custom !== "" ? parseFloat(form.lambda_custom) : (getLambda(selectedMat) ?? parseFloat(selectedMat.valeur_r));
  const epVal = parseFloat(form.epaisseur_cm);
  const rCalc = isFinite(lambdaVal) && lambdaVal > 0 && isFinite(epVal) && epVal > 0
    ? (epVal / 100) / lambdaVal
    : null;
  const lambdaIsCustom = form.lambda_custom !== "";

  return (
    <div style={{
      flexShrink: 0, borderTop: "1.5px solid #eef2f7",
      background: "#fafafa", padding: "16px 20px",
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#59169c", marginBottom: 12 }}>
        {selectedMat.name}
      </div>

      {isOpaque && isIsolantCategory(cat) && (
        <div>
          {(!isFinite(lambdaVal) || lambdaVal <= 0) && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
              padding: "6px 10px", marginBottom: 10, fontSize: 12,
              color: "#dc2626", fontWeight: 600,
            }}>
              λ manquant — bascule impossible. Renseignez λ pour activer le lien épaisseur ↔ R cible.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Épaisseur (cm)">
              <input type="number" min="0" step="any" value={form.epaisseur_cm}
                onChange={(e) => setForm((f) => {
                  const ep = parseFloat(e.target.value);
                  const lam = f.lambda_custom !== "" ? parseFloat(f.lambda_custom) : (getLambda(selectedMat) ?? parseFloat(selectedMat.valeur_r));
                  const linked = (isFinite(lam) && lam > 0 && isFinite(ep) && ep > 0)
                    ? String(((ep / 100) / lam).toFixed(3)) : f.r_cible;
                  return { ...f, epaisseur_cm: e.target.value, r_cible: linked };
                })}
                style={inputStyle} placeholder="ex : 20" autoFocus />
            </Field>
            <Field label="R cible (m²K/W) — calculé">
              <span style={{ fontSize: 13, color: "#374151" }}>
                {rCalc != null ? rCalc.toFixed(3) : "—"}
              </span>
            </Field>
            <Field label="λ (W/m·K)">
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                {getLambda(selectedMat) != null ? `${getLambda(selectedMat)} (λ)` : "—"}
              </span>
            </Field>
            <Field label="Surface (m²) — optionnel">
              <input type="number" min="0" step="any" value={form.surface_m2}
                onChange={(e) => setForm((f) => ({ ...f, surface_m2: e.target.value }))}
                style={inputStyle} placeholder="= S paroi" />
            </Field>
          </div>
        </div>
      )}

      {isOpaque && !isIsolantCategory(cat) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="R — Résistance thermique (m²·K/W)">
            <div style={{
              padding: "7px 10px", background: "#f9fafb", border: "1px solid #e5e7eb",
              borderRadius: 8, fontSize: 13, color: "#374151", fontWeight: 600,
            }}>
              {selectedMat.valeur_r != null ? `${fmtDec(parseFloat(selectedMat.valeur_r))} m²·K/W` : "—"}
            </div>
          </Field>
          <Field label={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              R local — override (m²K/W) {form.r_custom !== "" && <Pencil size={10} color="#f59e0b" />}
            </span>
          }>
            <input type="number" min="0" step="any" value={form.r_custom}
              onChange={(e) => setForm((f) => ({ ...f, r_custom: e.target.value }))}
              style={inputStyle} placeholder="— (optionnel)" />
          </Field>
          <Field label="Surface (m²) — optionnel">
            <input type="number" min="0" step="any" value={form.surface_m2}
              onChange={(e) => setForm((f) => ({ ...f, surface_m2: e.target.value }))}
              style={inputStyle} placeholder="= S paroi" />
          </Field>
        </div>
      )}

      {!isFenetre && !isOpaque && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Quantité">
            <input type="number" min="1" value={form.quantite}
              onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
              style={inputStyle} autoFocus />
          </Field>
          <Field label="Unité">
            <input type="text" value={form.unite_autre}
              onChange={(e) => setForm((f) => ({ ...f, unite_autre: e.target.value }))}
              style={inputStyle} placeholder="ex : m², u, ml…" />
          </Field>
        </div>
      )}

      <button
        type="button" onClick={onConfirm}
        style={{ ...primaryBtn, width: "100%", marginTop: 14, textAlign: "center" }}
      >
        Ajouter ce composant
      </button>
    </div>
  );
}

// ─── Generic UI ───────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: "white", borderRadius: 16, padding: "24px 26px", width: 440, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 100 }}>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>
      {children}
    </label>
  );
}

function SmallStat({ label, value }) {
  const missing = value === "—";
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: missing ? "#d1d5db" : "#374151" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, highlight }) {
  const missing = value === "—";
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: missing ? "#d1d5db" : (highlight ? "#59169c" : "#374151") }}>{value}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const detailCard = {
  background: "white", borderRadius: 14, padding: "16px 18px",
  border: "1.5px solid #eef2f7", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const cardTitle = { fontWeight: 900, fontSize: 15, color: "#111827", marginBottom: 14 };

const batRow = {
  background: "white", borderRadius: 14, padding: "12px 16px",
  border: "1.5px solid #eef2f7", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex", alignItems: "center", gap: 12,
};

const paroiCardStyle = {
  background: "#fafafa", borderRadius: 10, padding: "10px 12px",
  border: "1px solid #e5e7eb",
};

const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: "#9ca3af",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1.5px solid #e5e7eb", outline: "none",
  fontSize: 13, color: "#111827", background: "white", boxSizing: "border-box",
};

const miniInput = {
  width: "100%", padding: "4px 6px", borderRadius: 6,
  border: "1px solid #e5e7eb", outline: "none",
  fontSize: 12, color: "#111827", background: "white", boxSizing: "border-box",
};

const primaryBtn = {
  background: "#59169c", color: "white", border: "none",
  padding: "10px 14px", borderRadius: 12, fontWeight: 900,
  cursor: "pointer", fontSize: 14,
};

const smallBtn = {
  background: "#f5f3ff", color: "#59169c", border: "1px solid #ede9fe",
  padding: "5px 10px", borderRadius: 8, fontWeight: 700,
  cursor: "pointer", fontSize: 12,
  display: "inline-flex", alignItems: "center", gap: 5,
};

const cancelBtn = {
  background: "#f3f4f6", color: "#374151", border: "none",
  padding: "10px 14px", borderRadius: 12, fontWeight: 600,
  cursor: "pointer", fontSize: 14,
};

const iconBtn = {
  border: "1px solid #e5e7eb", background: "white", borderRadius: 8,
  padding: "5px 7px", cursor: "pointer", display: "flex",
  alignItems: "center", color: "#ca2946", flexShrink: 0,
};

const tinyIconBtn = {
  border: "none", background: "transparent", borderRadius: 6,
  padding: "3px 5px", cursor: "pointer", display: "flex",
  alignItems: "center", color: "#ca2946",
};

const emptyMsg = {
  fontSize: 12, color: "#9ca3af", textAlign: "center",
  padding: "10px 0", background: "#f9fafb",
  borderRadius: 8, marginBottom: 8,
};

const th = { textAlign: "left", padding: "4px 6px", fontWeight: 600, whiteSpace: "nowrap" };
const td = { padding: "5px 6px", verticalAlign: "middle" };
