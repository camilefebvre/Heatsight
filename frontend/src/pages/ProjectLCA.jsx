import { useEffect, useRef, useState, Fragment } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { apiFetch } from "../api";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAUFFAGE_OPTIONS = [
  { id: "gaz",        label: "Chaudière gaz",    co2: 0.205, rendement: 0.90 },
  { id: "mazout",     label: "Chaudière mazout",  co2: 0.265, rendement: 0.85 },
  { id: "bois",       label: "Chaudière bois",    co2: 0.030, rendement: 0.75 },
  { id: "pac",        label: "Pompe à chaleur",   co2: 0.056, rendement: 3.0  },
  { id: "electrique", label: "Électrique direct", co2: 0.056, rendement: 1.0  },
];

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

// Normalise une chaîne : retire les accents, met en minuscules
function normStr(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Vrai si la catégorie désigne une fenêtre, quelle que soit la casse/accentuation
function isFenetreCategory(cat) {
  return normStr(cat) === "fenetre";
}

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
    for (const co of paroi.composantsOpaques) {
      if (!co.is_fixed) changeables.push({ id: co.material_id, q: String(co.surface_m2 ?? "") });
    }
    for (const bv of paroi.baiesVitrees) {
      if (!bv.is_fixed) changeables.push({ id: bv.material_id, q: String(bv.surface_vitree_m2 ?? "") });
    }
  }
  changeables.sort((a, b) => a.id.localeCompare(b.id));

  const matLib = materials.map(m => ({ i: m.id, p: m.prix ?? null, r: m.valeur_r ?? null }));
  matLib.sort((a, b) => a.i.localeCompare(b.i));

  const ch = CHAUFFAGE_OPTIONS.find(o => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const energy = { dj: bat.degres_jours, rdt: ch.rendement, co2: ch.co2 };

  return djb2Hash(JSON.stringify({ changeables, matLib, energy }));
}

// Fix 1 — Génération déterministe des combinaisons (tri coût ASC puis GWP ASC, max 500)
function buildCombinations(bat, materials) {
  const MAX_COMBOS = 500;
  const PER_SLOT   = 5; // max candidats par slot pour éviter l'explosion combinatoire

  const slots = [];

  for (const paroi of bat.parois) {
    for (const co of paroi.composantsOpaques) {
      if (co.is_fixed) continue;
      const curMat = materials.find(m => m.id === co.material_id);
      const curCat = curMat ? (curMat.category || "Autre") : "Autre";

      let altMats = materials
        .filter(m => !isFenetreCategory(m.category || "Autre") && (m.category || "Autre") === curCat)
        .sort((a, b) => (parseFloat(a.prix) || 0) - (parseFloat(b.prix) || 0))
        .slice(0, PER_SLOT);

      // S'assurer que le matériau courant est inclus
      if (!altMats.find(m => m.id === co.material_id) && curMat) {
        altMats = [curMat, ...altMats].slice(0, PER_SLOT);
      }

      const candidates = altMats.map(m => ({
        ...co,
        material_id: m.id,
        material_name: m.name,
        lambda_lib: parseFloat(m.valeur_r) ?? null,
        lambda_local: "",
        r_local: "",
        prix_unit: parseFloat(m.prix) || 0,
        gwp100_unit: extractImpact(m.impacts, "gwp100", "gwp_100") || 0,
        impacts: m.impacts || {},
      }));

      if (candidates.length > 0) {
        slots.push({ paroiId: paroi.id, compId: co.id, type: "opaque", candidates });
      }
    }

    for (const bv of paroi.baiesVitrees) {
      if (bv.is_fixed) continue;

      let altMats = materials
        .filter(m => isFenetreCategory(m.category || "Autre"))
        .sort((a, b) => (parseFloat(a.prix) || 0) - (parseFloat(b.prix) || 0))
        .slice(0, PER_SLOT);

      if (!altMats.find(m => m.id === bv.material_id)) {
        const curMat = materials.find(m => m.id === bv.material_id);
        if (curMat) altMats = [curMat, ...altMats].slice(0, PER_SLOT);
      }

      const candidates = altMats.map(m => ({
        ...bv,
        material_id: m.id,
        material_name: m.name,
        valeur_r: parseFloat(m.valeur_r) || 0,
        prix_unit: parseFloat(m.prix) || 0,
        gwp100_unit: extractImpact(m.impacts, "gwp100", "gwp_100") || 0,
        impacts: m.impacts || {},
      }));

      if (candidates.length > 0) {
        slots.push({ paroiId: paroi.id, compId: bv.id, type: "vitree", candidates });
      }
    }
  }

  if (slots.length === 0) return [];

  function applyChoice(b, slot, cand) {
    return {
      ...b,
      parois: b.parois.map(p => {
        if (p.id !== slot.paroiId) return p;
        return slot.type === "opaque"
          ? { ...p, composantsOpaques: p.composantsOpaques.map(c => c.id === slot.compId ? cand : c) }
          : { ...p, baiesVitrees:      p.baiesVitrees.map(bv => bv.id === slot.compId ? cand : bv) };
      }),
    };
  }

  const combos = [];

  function enumerate(idx, curBat, choices) {
    if (idx === slots.length) {
      const st = calcBatimentStats(curBat);
      combos.push({
        cost:       st.total_cout ?? 0,
        gwp:        st.total_gwp  ?? 0,
        energy_kwh: st.energy_kwh ?? null,
        dep_wk:     st.dep_wk     ?? null,
        choices,
      });
      return;
    }
    const slot = slots[idx];
    for (const cand of slot.candidates) {
      enumerate(
        idx + 1,
        applyChoice(curBat, slot, cand),
        [...choices, {
          paroiId: slot.paroiId, compId: slot.compId, type: slot.type,
          material_id: cand.material_id, material_name: cand.material_name,
          prix_unit: cand.prix_unit,
        }],
      );
    }
  }

  enumerate(0, bat, []);

  // Fix 1 : tri déterministe — coût croissant, puis GWP croissant
  combos.sort((a, b) => a.cost !== b.cost ? a.cost - b.cost : a.gwp - b.gwp);
  return combos.slice(0, MAX_COMBOS);
}

function computePhares(combos, bat) {
  const sqSt     = calcBatimentStats(bat);
  const sqCost   = sqSt.total_cout   ?? 0;
  const sqGwp    = sqSt.total_gwp    ?? 0;
  const sqEnergy = sqSt.energy_kwh   ?? null;

  const statuQuo = { cost: sqCost, gwp: sqGwp, energy_kwh: sqEnergy, choices: [] };

  if (combos.length === 0) {
    return { statuQuo, economique: null, ecologique: null, roi: null, topsis: null };
  }

  const economique = [...combos].sort((a, b) => a.cost - b.cost)[0];
  const ecologique = [...combos].sort((a, b) => a.gwp  - b.gwp )[0];

  // ROI : (économies énergie sur 20 ans à 0,20 €/kWh) / surcoût
  const PRICE = 0.20, HORIZON = 20;
  let roi = null;
  if (sqEnergy != null) {
    const cands = combos.filter(c => c.cost > sqCost && c.energy_kwh != null);
    if (cands.length > 0) {
      roi = cands.reduce((best, c) => {
        const r = (sqEnergy - c.energy_kwh) * PRICE * HORIZON / (c.cost - sqCost);
        const b = (sqEnergy - best.energy_kwh) * PRICE * HORIZON / (best.cost - sqCost);
        return r > b ? c : best;
      });
    }
  }

  // TOPSIS 3 critères : coût, GWP, énergie (tous à minimiser)
  const valid = combos.filter(c => c.energy_kwh != null);
  let topsis = null;
  if (valid.length > 1) {
    const vals = k => valid.map(c => c[k]);
    const mn = k => Math.min(...vals(k));
    const mx = k => Math.max(...vals(k));
    const [minC, maxC] = [mn("cost"), mx("cost")];
    const [minG, maxG] = [mn("gwp"),  mx("gwp")];
    const [minE, maxE] = [mn("energy_kwh"), mx("energy_kwh")];
    const n = (v, lo, hi) => hi === lo ? 0 : (v - lo) / (hi - lo);
    const scored = valid.map(c => {
      const nc = n(c.cost, minC, maxC), ng = n(c.gwp, minG, maxG), ne = n(c.energy_kwh, minE, maxE);
      const dI = Math.sqrt(nc*nc + ng*ng + ne*ne);
      const dA = Math.sqrt((1-nc)**2 + (1-ng)**2 + (1-ne)**2);
      return { c, score: (dI + dA) > 0 ? dA / (dI + dA) : 0 };
    });
    scored.sort((a, b) => b.score - a.score);
    topsis = scored[0].c;
  } else if (valid.length === 1) {
    topsis = valid[0];
  }

  return { statuQuo, economique, ecologique, roi, topsis };
}

// ─── R of a composant opaque (m²·K/W) ────────────────────────────────────────
function getComposantR(comp) {
  const rLocal = parseFloat(comp.r_local);
  if (isFinite(rLocal) && rLocal > 0) return rLocal;
  const lambda = parseFloat(comp.lambda_local) || parseFloat(comp.lambda_lib);
  const ep = parseFloat(comp.epaisseur_cm);
  if (isFinite(lambda) && lambda > 0 && isFinite(ep) && ep > 0) {
    return (ep / 100) / lambda;
  }
  return null;
}

function calcParoiStats(paroi) {
  const S_tot = parseFloat(paroi.surface_totale);
  if (!isFinite(S_tot) || S_tot <= 0) return null;

  let s_vitree = 0;
  let ua_vitree = 0;
  let cout_vitree = 0;
  let gwp_vitree = 0;
  for (const bv of paroi.baiesVitrees) {
    const sv = parseFloat(bv.surface_vitree_m2);
    const vr = parseFloat(bv.valeur_r);
    const qty = parseFloat(bv.quantite) || 1;
    if (isFinite(sv) && sv > 0) {
      s_vitree += sv;
      if (isFinite(vr) && vr > 0) ua_vitree += sv * (1 / vr);
    }
    cout_vitree += (parseFloat(bv.prix_unit) || 0) * qty;
    gwp_vitree += (parseFloat(bv.gwp100_unit) || 0) * qty;
  }

  const s_opaque = Math.max(0, S_tot - s_vitree);

  let r_total = 0;
  let hasAllR = paroi.composantsOpaques.length > 0;
  let cout_opaque = 0;
  let gwp_opaque = 0;
  for (const co of paroi.composantsOpaques) {
    const r = getComposantR(co);
    if (r == null) { hasAllR = false; } else { r_total += r; }
    const s = parseFloat(co.surface_m2) || s_opaque;
    cout_opaque += (parseFloat(co.prix_unit) || 0) * s;
    gwp_opaque += (parseFloat(co.gwp100_unit) || 0) * s;
  }

  const u_opaque = (hasAllR && r_total > 0) ? 1 / r_total : null;
  const ua_opaque = u_opaque != null ? u_opaque * s_opaque : null;
  const ua_total = ua_opaque != null ? ua_opaque + ua_vitree : null;
  const u_moyen = ua_total != null ? ua_total / S_tot : null;
  const dep_wk = u_moyen != null ? u_moyen * S_tot : null;
  const cout = cout_opaque + cout_vitree;
  const gwp = gwp_opaque + gwp_vitree;

  return {
    r_total: hasAllR && r_total > 0 ? r_total : null,
    u_opaque,
    u_moyen,
    dep_wk,
    s_vitree,
    s_opaque,
    S_tot,
    cout: cout > 0 ? cout : null,
    gwp: gwp > 0 ? gwp : null,
  };
}

function calcBatimentStats(bat) {
  const dj = parseFloat(bat.degres_jours) || 2500;
  const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];

  let total_dep = 0;
  let allHaveDep = bat.parois.length > 0;
  let total_cout = 0;
  let total_gwp = 0;

  for (const p of bat.parois) {
    const s = calcParoiStats(p);
    if (!s || s.dep_wk == null) { allHaveDep = false; }
    else { total_dep += s.dep_wk; }
    if (s?.cout) total_cout += s.cout;
    if (s?.gwp) total_gwp += s.gwp;
  }

  const dep_wk = allHaveDep ? total_dep : null;
  const energy_kwh = dep_wk != null ? (dep_wk * dj * 24) / 1000 / ch.rendement : null;
  const co2_exploitation = energy_kwh != null ? energy_kwh * ch.co2 : null;

  return {
    dep_wk,
    energy_kwh,
    co2_exploitation,
    total_cout: total_cout > 0 ? total_cout : null,
    total_gwp: total_gwp > 0 ? total_gwp : null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectLCA() {
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
  const [saveStatus,      setSaveStatus]      = useState("idle"); // "idle" | "saving" | "saved"
  const [auditKwh,        setAuditKwh]        = useState(null);   // kWh/an depuis l'audit, null si absent
  const [optBatId,        setOptBatId]        = useState(null);   // id du bâtiment dont le panneau optim est ouvert
  const [optCachedHash,   setOptCachedHash]   = useState(null);   // hash sauvegardé côté serveur
  const [optCachedResult, setOptCachedResult] = useState(null);   // cache sauvegardé côté serveur

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
    apiFetch(`/projects/${projectId}/lca`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        dataLoaded.current = true;
        if (Array.isArray(data.batiments) && data.batiments.length > 0) {
          skipNextSave.current = true;
          setBatiments(data.batiments);
        }
        setOptCachedHash(data.optimisation_hash   ?? null);
        setOptCachedResult(data.optimisation_cache ?? null);
      })
      .catch(() => { dataLoaded.current = true; });
  }, [projectId]);

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
        const res = await apiFetch(`/projects/${projectId}/lca/batiments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batiments }),
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

  function addBatiment() {
    const n = batiments.length + 1;
    setBatiments((prev) => [...prev, {
      id: newId(), nom: `Bâtiment ${n}`,
      surface_plancher: "", hauteur: "", temperature_interieure: 20,
      moyen_chauffage: "gaz", degres_jours: 2500, parois: [],
    }]);
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
    setCompForm({ material_id: "", quantite: "1", epaisseur_cm: "", surface_m2: "", surface_vitree_m2: "", lambda_custom: "", r_custom: "", unite_autre: "" });
    setCompModal({ batId, paroiId, type });
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
        surface_vitree_m2: compForm.surface_vitree_m2,
        is_fixed: false,
        prix_unit: parseFloat(mat.prix) || 0,
        gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
        impacts: mat.impacts || {},
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
        epaisseur_cm: compForm.epaisseur_cm,
        lambda_lib: parseFloat(mat.valeur_r) ?? null,
        lambda_local: compForm.lambda_custom !== "" ? compForm.lambda_custom : "",
        r_lib: null, r_local: "",
        surface_m2: compForm.surface_m2,
        // for "Autre": store quantite and unite_autre
        quantite: cat === "Autre" ? (parseFloat(compForm.quantite) || 1) : undefined,
        unite_autre: cat === "Autre" ? compForm.unite_autre : undefined,
        is_fixed: false,
        prix_unit: parseFloat(mat.prix) || 0,
        gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
        impacts: mat.impacts || {},
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
        <div style={{ marginTop: 12, background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button type="button" onClick={addBatiment}
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
                    onClick={() => selectBatiment(bat.id)}
                    style={{
                      ...batRow,
                      background: isSelected ? "#f5f3ff" : "white",
                      borderColor: isSelected ? "#8b5cf6" : "#eef2f7",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div style={{ color: "#6d28d9" }}>
                        {isSelected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{bat.nom}</div>
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

      {/* Material side panel */}
      {compModal && (
        <MaterialSidePanel
          modal={compModal} form={compForm} setForm={setCompForm}
          materials={materials} onConfirm={confirmAddComposant} onClose={() => setCompModal(null)}
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
}) {
  return (
    <div style={detailCard}>
      <div style={cardTitle}>Construction du bâtiment</div>

      <div style={sectionLabel}>Paramètres énergétiques</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
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
      </div>

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
            const stats = calcParoiStats(paroi);
            const tab = getParoiTab(paroi.id);
            const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
            const dj = parseFloat(bat.degres_jours) || 2500;
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
  paroi, stats, isExpanded, tab,
  dep_contrib, energy_contrib, co2_contrib,
  toggleParoi, setTab, updateParoi, removeParoi,
  openAddComposant, updateComposant, updateBaieVitree, removeComposant,
}) {
  return (
    <div style={paroiCardStyle}>
      {/* Header */}
      <div onClick={toggleParoi} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
        <div style={{ color: "#6d28d9", marginTop: 2, flexShrink: 0 }}>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{paroi.nom}</span>
            <span style={{ fontSize: 11, background: "#ede9fe", color: "#6d28d9", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>
              {PAROI_TYPE_LABELS[paroi.type] || paroi.type}
            </span>
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
                  borderBottom: tab === t ? "2px solid #6d28d9" : "2px solid transparent",
                  background: "transparent",
                  fontWeight: tab === t ? 700 : 500, fontSize: 13,
                  color: tab === t ? "#6d28d9" : "#6b7280",
                  cursor: "pointer", marginBottom: -1.5,
                }}>
                {t === "consommation" ? "Consommation" : "Impacts"}
              </button>
            ))}
          </div>

          {tab === "consommation" && (
            <ConsommationTab
              paroi={paroi} stats={stats}
              dep_contrib={dep_contrib} energy_contrib={energy_contrib} co2_contrib={co2_contrib}
              openAddComposant={openAddComposant}
              updateComposant={updateComposant}
              updateBaieVitree={updateBaieVitree}
              removeComposant={removeComposant}
            />
          )}
          {tab === "impacts" && (
            <ImpactsTab paroi={paroi} stats={stats} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── ConsommationTab ──────────────────────────────────────────────────────────

function ConsommationTab({ paroi, stats, dep_contrib, energy_contrib, co2_contrib, openAddComposant, updateComposant, updateBaieVitree, removeComposant }) {
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
              <th style={th}>Matériau</th>
              <th style={th}>Ép. (cm)</th>
              <th style={th}>λ</th>
              <th style={th}>R</th>
              <th style={th}>S (m²)</th>
              <th style={{ ...th, textAlign: "center" }}>Fixe</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {paroi.composantsOpaques.map((co) => {
              const r = getComposantR(co);
              const lambdaIsCustom = co.lambda_local !== "" && co.lambda_local != null;
              const rIsCustom = co.r_local !== "" && co.r_local != null;
              return (
                <tr key={co.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}>{co.material_name}</td>
                  <td style={td}>
                    <input type="number" min="0" step="any" value={co.epaisseur_cm}
                      onChange={(e) => updateComposant(co.id, "epaisseur_cm", e.target.value)}
                      style={miniInput} placeholder="—" />
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input type="number" min="0" step="any"
                        value={co.lambda_local !== "" ? co.lambda_local : (co.lambda_lib ?? "")}
                        onChange={(e) => updateComposant(co.id, "lambda_local", e.target.value)}
                        style={miniInput} placeholder={co.lambda_lib ? String(co.lambda_lib) : "—"} />
                      {lambdaIsCustom && <Pencil size={10} color="#f59e0b" />}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input type="number" min="0" step="any" value={co.r_local}
                        onChange={(e) => updateComposant(co.id, "r_local", e.target.value)}
                        style={miniInput} placeholder={r != null ? fmtDec(r) : "—"} />
                      {rIsCustom && <Pencil size={10} color="#f59e0b" />}
                    </div>
                  </td>
                  <td style={td}>
                    <input type="number" min="0" step="any" value={co.surface_m2}
                      onChange={(e) => updateComposant(co.id, "surface_m2", e.target.value)}
                      style={miniInput} placeholder={stats ? fmtDec(stats.s_opaque, 1) : "—"} />
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
      )}

      {/* Baies vitrées */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={sectionLabel}>Baies vitrées</div>
        <button type="button" onClick={(e) => { e.stopPropagation(); openAddComposant("vitree"); }} style={smallBtn}>
          <Plus size={11} /> Ajouter
        </button>
      </div>

      {paroi.baiesVitrees.length === 0 ? (
        <div style={emptyMsg}>Aucune baie vitrée — S vitrée = 0 m²</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
              <th style={th}>Matériau</th>
              <th style={th}>R (m²K/W)</th>
              <th style={th}>Qté</th>
              <th style={th}>S vitrée (m²)</th>
              <th style={{ ...th, textAlign: "center" }}>Fixe</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {paroi.baiesVitrees.map((bv) => (
              <tr key={bv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{bv.material_name}</td>
                <td style={td}>{fmtDec(bv.valeur_r)}</td>
                <td style={td}>
                  <input type="number" min="1" value={bv.quantite}
                    onChange={(e) => updateBaieVitree(bv.id, "quantite", e.target.value)}
                    style={miniInput} />
                </td>
                <td style={td}>
                  <input type="number" min="0" step="any" value={bv.surface_vitree_m2}
                    onChange={(e) => updateBaieVitree(bv.id, "surface_vitree_m2", e.target.value)}
                    style={miniInput} placeholder="m²" />
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
            ))}
          </tbody>
        </table>
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

const IMPACT_ROWS = [
  { label: "GWP100",               keys: ["gwp100", "gwp_100"],             unit: "kg CO₂eq"   },
  { label: "Acidification",        keys: ["acidification", "ap"],           unit: "mol H⁺eq"   },
  { label: "Énergie non-ren.",      keys: ["energy_nr", "penrt", "pe_nr"],   unit: "MJ"         },
  { label: "Eutrophisation",        keys: ["eutrophication", "ep", "ep_fw"], unit: "kg P eq"    },
  { label: "Écotoxicité eau douce", keys: ["ecotoxicity_fw", "ctue"],        unit: "CTUe"       },
];

function ImpactsTab({ paroi, stats }) {
  const allComps = [...paroi.composantsOpaques, ...paroi.baiesVitrees];
  if (allComps.length === 0) {
    return (
      <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
        Ajoutez des composants pour voir les impacts
      </div>
    );
  }

  function sumImpact(keys) {
    let total = 0; let hasAny = false;
    for (const co of paroi.composantsOpaques) {
      const s = parseFloat(co.surface_m2) || (stats?.s_opaque ?? 0);
      const v = extractImpact(co.impacts, ...keys);
      if (v != null) { total += v * s; hasAny = true; }
    }
    for (const bv of paroi.baiesVitrees) {
      const qty = parseFloat(bv.quantite) || 1;
      const v = extractImpact(bv.impacts, ...keys);
      if (v != null) { total += v * qty; hasAny = true; }
    }
    return hasAny ? total : null;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        {IMPACT_ROWS.map((imp) => {
          const v = sumImpact(imp.keys);
          return (
            <div key={imp.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{imp.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: v != null ? "#6d28d9" : "#d1d5db", marginTop: 2 }}>
                {v != null ? fmt(v) : "—"}
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>{imp.unit}</div>
            </div>
          );
        })}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
            <th style={th}>Composant</th>
            <th style={th}>GWP100</th>
            <th style={th}>Acidif.</th>
            <th style={th}>Énergie NR</th>
          </tr>
        </thead>
        <tbody>
          {paroi.composantsOpaques.map((co) => {
            const s = parseFloat(co.surface_m2) || (stats?.s_opaque ?? 0);
            const gwp  = extractImpact(co.impacts, "gwp100", "gwp_100");
            const acid = extractImpact(co.impacts, "acidification", "ap");
            const enr  = extractImpact(co.impacts, "energy_nr", "penrt", "pe_nr");
            return (
              <tr key={co.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{co.material_name} <span style={{ color: "#9ca3af" }}>({fmtDec(s, 1)} m²)</span></td>
                <td style={td}>{gwp  != null ? fmtDec(gwp  * s, 1) : "—"}</td>
                <td style={td}>{acid != null ? fmtDec(acid * s, 3) : "—"}</td>
                <td style={td}>{enr  != null ? fmtDec(enr  * s, 1) : "—"}</td>
              </tr>
            );
          })}
          {paroi.baiesVitrees.map((bv) => {
            const qty  = parseFloat(bv.quantite) || 1;
            const gwp  = extractImpact(bv.impacts, "gwp100", "gwp_100");
            const acid = extractImpact(bv.impacts, "acidification", "ap");
            const enr  = extractImpact(bv.impacts, "energy_nr", "penrt", "pe_nr");
            return (
              <tr key={bv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{bv.material_name} <span style={{ color: "#9ca3af" }}>(×{qty})</span></td>
                <td style={td}>{gwp  != null ? fmtDec(gwp  * qty, 1) : "—"}</td>
                <td style={td}>{acid != null ? fmtDec(acid * qty, 3) : "—"}</td>
                <td style={td}>{enr  != null ? fmtDec(enr  * qty, 1) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── ResultsWidget ────────────────────────────────────────────────────────────

function ResultsWidget({ bat, stats, auditKwh, onOptimize }) {
  const paroisStats = bat.parois.map((p) => ({ paroi: p, s: calcParoiStats(p) }));
  const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const dj = parseFloat(bat.degres_jours) || 2500;

  function paroiConso(s) {
    if (s?.dep_wk == null) return null;
    return (s.dep_wk * dj * 24) / 1000 / ch.rendement;
  }

  return (
    <div style={detailCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={cardTitle} >Impacts globaux</div>
        {onOptimize && (
          <button type="button" onClick={onOptimize}
            style={{ ...smallBtn, fontSize: 12, padding: "6px 12px" }}>
            ⚡ Optimiser
          </button>
        )}
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
          color="#6d28d9"
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

  useEffect(() => {
    if (materials.length === 0) return;
    if (phase !== "init") return;
    if (cachedResult?.solutions) {
      setPhares(cachedResult.solutions);
      setComputedAt(cachedResult.computed_at ?? null);
      setIsStale(cachedHash !== configHash);
      setPhase("done");
    } else {
      runCompute();
    }
  }, [materials.length, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function runCompute() {
    setPhase("computing");
    setTimeout(() => {
      const combos = buildCombinations(bat, materials);
      const result = computePhares(combos, bat);
      const now = new Date().toISOString();
      setPhares(result);
      setComputedAt(now);
      setIsStale(false);
      setPhase("done");
      const payload = { hash: configHash, cache: { computed_at: now, solutions: result } };
      apiFetch(`/projects/${projectId}/lca/optimisation-cache`, {
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

  const PRIX_KWH = 0.20;

  function calcROI(sol, sq) {
    const surCout = sol.cost - sq.cost;
    const econKwh = (sq.energy_kwh ?? 0) - (sol.energy_kwh ?? 0);
    if (surCout > 0 && econKwh > 0)  return { type: "years",     value:   surCout / (econKwh * PRIX_KWH) };
    if (surCout <= 0 && econKwh > 0) return { type: "immediate"                                           };
    if (surCout <= 0 && econKwh <= 0) return { type: "cheaper",  savings: -surCout                        };
    /* surCout > 0 && econKwh <= 0 */  return { type: "infinite"                                          };
  }

  function renderROICell(roi) {
    if (roi === null) return <span style={{ color: "#9ca3af" }}>—</span>;
    if (roi.type === "years") {
      const v = roi.value;
      const c = v < 15 ? "#059669" : v <= 25 ? "#d97706" : "#dc2626";
      return <span style={{ fontWeight: 700, color: c }}>{fmtDec(v, 1)}</span>;
    }
    if (roi.type === "immediate")
      return <span style={{ fontWeight: 700, color: "#059669", fontSize: 11 }}>✓ Immédiat + gains</span>;
    if (roi.type === "cheaper")
      return (
        <div>
          <div style={{ fontWeight: 700, color: "#059669", fontSize: 11 }}>✓ Moins cher</div>
          {roi.savings > 0 && <div style={{ fontSize: 10, color: "#059669" }}>−{fmt(roi.savings)} €</div>}
        </div>
      );
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
      const rows = [];
      for (const co of paroi.composantsOpaques) {
        if (co.is_fixed) continue;
        const choice = sol.choices?.find(c => c.paroiId === paroi.id && c.compId === co.id);
        const changed = !!(choice && choice.material_id !== co.material_id);
        rows.push({ original: co.material_name, chosen: changed ? choice.material_name : null, changed });
      }
      for (const bv of paroi.baiesVitrees) {
        if (bv.is_fixed) continue;
        const choice = sol.choices?.find(c => c.paroiId === paroi.id && c.compId === bv.id);
        const changed = !!(choice && choice.material_id !== bv.material_id);
        rows.push({ original: bv.material_name, chosen: changed ? choice.material_name : null, changed });
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
          for (let i = 0; i < paroi.composantsOpaques.length; i++) {
            if (paroi.composantsOpaques[i].id !== choice.compId) continue;
            const mat = materials.find(m => m.id === choice.material_id);
            if (mat) {
              paroi.composantsOpaques[i] = {
                ...paroi.composantsOpaques[i],
                material_id: mat.id,
                material_name: mat.name,
                lambda_lib: parseFloat(mat.valeur_r) ?? null,
                lambda_local: "",
                r_local: "",
                prix_unit: parseFloat(mat.prix) || 0,
                gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100") || 0,
                impacts: mat.impacts || {},
              };
            }
          }
        } else {
          for (let i = 0; i < paroi.baiesVitrees.length; i++) {
            if (paroi.baiesVitrees[i].id !== choice.compId) continue;
            const mat = materials.find(m => m.id === choice.material_id);
            if (mat) {
              paroi.baiesVitrees[i] = {
                ...paroi.baiesVitrees[i],
                material_id: mat.id,
                material_name: mat.name,
                valeur_r: parseFloat(mat.valeur_r) || 0,
                prix_unit: parseFloat(mat.prix) || 0,
                gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100") || 0,
                impacts: mat.impacts || {},
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
    { key: "economique", label: "Économique",   color: "#059669", icon: "€" },
    { key: "ecologique", label: "Écologique",   color: "#16a34a", icon: "🌿" },
    { key: "roi",        label: "Meilleur ROI", color: "#2563eb", icon: "↩" },
    { key: "topsis",     label: "TOPSIS",       color: "#6d28d9", icon: "★" },
  ];

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

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#9ca3af", fontWeight: 600, borderBottom: "1.5px solid #f3f4f6" }}>
                      <th style={{ ...th, minWidth: 110 }}>Profil</th>
                      <th style={{ ...th, textAlign: "right" }}>Coût (€)</th>
                      <th style={{ ...th, textAlign: "right" }}>GWP100 (kg)</th>
                      <th style={{ ...th, textAlign: "right" }}>Énergie (kWh/an)</th>
                      <th style={{ ...th, textAlign: "right" }}>Économies (kWh)</th>
                      <th style={{ ...th, textAlign: "right" }}>ROI (ans)</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {PHARE_DEFS.map(({ key, label, color, icon }) => {
                      const sol = phares[key];
                      const isExpanded = expandedProfile === key;
                      if (!sol) return (
                        <tr key={key} style={{ borderTop: "1px solid #f3f4f6", opacity: 0.4 }}>
                          <td style={td} colSpan={7}>
                            <span style={{ fontWeight: 600, color: "#9ca3af" }}>{icon} {label}</span>
                            <span style={{ color: "#d1d5db", marginLeft: 8, fontSize: 11 }}>Non disponible</span>
                          </td>
                        </tr>
                      );
                      const sq = phares.statuQuo;
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
                            <td style={{ ...td, textAlign: "right", fontWeight: 600, color: key === "statuQuo" ? "#374151" : cmpColor(sol.cost, sq.cost) }}>{fmt(sol.cost)}</td>
                            <td style={{ ...td, textAlign: "right", color: key === "statuQuo" ? "#374151" : cmpColor(sol.gwp, sq.gwp) }}>{fmt(sol.gwp)}</td>
                            <td style={{ ...td, textAlign: "right", color: key === "statuQuo" ? "#374151" : cmpColor(sol.energy_kwh, sq.energy_kwh) }}>{sol.energy_kwh != null ? fmt(sol.energy_kwh) : "—"}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600, color: econKwh != null && econKwh > 0 ? "#059669" : (econKwh != null && econKwh < 0 ? "#dc2626" : "#9ca3af") }}>
                              {econKwh != null ? (econKwh >= 0 ? "+" : "") + fmt(econKwh) : "—"}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>
                              {renderROICell(roi)}
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
                              <td colSpan={7} style={{ padding: "10px 16px 14px" }}>
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
                                            <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                              {row.changed ? (
                                                <>
                                                  <span style={{ color: "#9ca3af", textDecoration: "line-through" }}>{row.original}</span>
                                                  <span style={{ color: "#6b7280" }}>→</span>
                                                  <span style={{ fontWeight: 700, color, background: color + "18", padding: "1px 6px", borderRadius: 4 }}>{row.chosen}</span>
                                                </>
                                              ) : (
                                                <span style={{ color: "#9ca3af", fontStyle: "italic" }}>{row.original} — inchangé</span>
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
      <div style={{ fontSize: 15, fontWeight: 900, color: missing ? "#d1d5db" : "#6d28d9" }}>{value}</div>
      {!missing && unit && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

// ─── MaterialSidePanel ────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["Mur", "Isolant", "Fenêtre", "Toiture", "Plancher", "Cloison", "Cadre", "Autre"];
const OPAQUE_CATS = new Set(["Mur", "Toiture", "Plancher", "Cloison", "Cadre"]);

function MaterialSidePanel({ modal, form, setForm, materials, onConfirm, onClose }) {
  const { type } = modal;
  const [search, setSearch] = useState("");

  const filtered = materials.filter((m) => {
    const cat = m.category || "Autre";
    const matchType = type === "vitree" ? isFenetreCategory(cat) : !isFenetreCategory(cat);
    const matchSearch = !search.trim() || m.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // Group by category, sorted per CATEGORY_ORDER then alphabetically
  const groups = {};
  for (const m of filtered) {
    const cat = m.category || "Autre";
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

  const [openCat, setOpenCat] = useState(null);

  function toggleCat(cat) {
    setOpenCat((prev) => (prev === cat ? null : cat));
  }

  const selectedMat = materials.find((m) => m.id === form.material_id) || null;

  function selectMat(m) {
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
            {type === "vitree" ? "Baie vitrée" : "Composant opaque"}
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
                    color: isOpen ? "#6d28d9" : "#374151",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    marginBottom: isOpen ? 4 : 0,
                  }}
                >
                  <span>{cat}</span>
                  <span style={{ fontSize: 11, color: isOpen ? "#6d28d9" : "#9ca3af" }}>
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

        {/* Inline form — visible only when a material is selected */}
        {selectedMat && (
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
  const isOpaque = OPAQUE_CATS.has(cat) || (!isFenetre && cat !== "Autre");

  // For opaque: R = ep / (lambda * 100)
  const lambdaVal = form.lambda_custom !== "" ? parseFloat(form.lambda_custom) : parseFloat(selectedMat.valeur_r);
  const epVal = parseFloat(form.epaisseur_cm);
  const rCalc = isFinite(lambdaVal) && lambdaVal > 0 && isFinite(epVal) && epVal > 0
    ? (epVal / 100) / lambdaVal
    : null;
  const lambdaIsCustom = form.lambda_custom !== "";

  // For fenetre: R and U
  const rFenVal = form.r_custom !== "" ? parseFloat(form.r_custom) : parseFloat(selectedMat.valeur_r);
  const uFen = isFinite(rFenVal) && rFenVal > 0 ? (1 / rFenVal).toFixed(3) : "—";
  const rFenIsCustom = form.r_custom !== "";
  const rLibNull = selectedMat.valeur_r == null;

  return (
    <div style={{
      flexShrink: 0, borderTop: "1.5px solid #eef2f7",
      background: "#fafafa", padding: "16px 20px",
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9", marginBottom: 12 }}>
        {selectedMat.name}
      </div>

      {isFenetre && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Quantité (unités)">
            <input type="number" min="1" value={form.quantite}
              onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
              style={inputStyle} autoFocus />
          </Field>
          <Field label="Surface vitrée (m²)">
            <input type="number" min="0" step="any" value={form.surface_vitree_m2}
              onChange={(e) => setForm((f) => ({ ...f, surface_vitree_m2: e.target.value }))}
              style={inputStyle} placeholder="ex : 1.5" />
          </Field>
          <Field label={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              R global (m²K/W) {rFenIsCustom && <Pencil size={10} color="#f59e0b" />}
            </span>
          }>
            <input type="number" min="0" step="any"
              value={form.r_custom !== "" ? form.r_custom : (selectedMat.valeur_r ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, r_custom: e.target.value }))}
              style={{ ...inputStyle, borderColor: rLibNull ? "#f97316" : undefined }}
              placeholder={rLibNull ? "à renseigner" : "—"} />
            {rLibNull && (
              <span style={{ fontSize: 11, color: "#ea580c", marginTop: 2 }}>Valeur R manquante — à renseigner</span>
            )}
          </Field>
          <Field label="U (W/m²K) — calculé">
            <input type="text" readOnly value={uFen}
              style={{ ...inputStyle, background: "#f3f4f6", color: "#6b7280" }} />
          </Field>
        </div>
      )}

      {isOpaque && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Épaisseur (cm)">
            <input type="number" min="0" step="any" value={form.epaisseur_cm}
              onChange={(e) => setForm((f) => ({ ...f, epaisseur_cm: e.target.value }))}
              style={inputStyle} placeholder="ex : 20" autoFocus />
          </Field>
          <Field label={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              λ (W/m·K) {lambdaIsCustom && <Pencil size={10} color="#f59e0b" />}
            </span>
          }>
            <input type="number" min="0" step="any"
              value={form.lambda_custom !== "" ? form.lambda_custom : (selectedMat.valeur_r ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, lambda_custom: e.target.value }))}
              style={inputStyle} placeholder={selectedMat.valeur_r != null ? String(selectedMat.valeur_r) : "—"} />
          </Field>
          <Field label={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              R calculé (m²K/W)
            </span>
          }>
            <input type="text" readOnly
              value={rCalc != null ? fmtDec(rCalc) : (rLibNull ? "—" : "—")}
              style={{
                ...inputStyle,
                background: "#f3f4f6",
                color: rLibNull ? "#ea580c" : "#6b7280",
                borderColor: rLibNull ? "#f97316" : undefined,
              }} />
            {rLibNull && (
              <span style={{ fontSize: 11, color: "#ea580c", marginTop: 2 }}>Valeur R manquante — à renseigner</span>
            )}
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
      <div style={{ fontSize: 12, fontWeight: 700, color: missing ? "#d1d5db" : (highlight ? "#6d28d9" : "#374151") }}>{value}</div>
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
  background: "#6d28d9", color: "white", border: "none",
  padding: "10px 14px", borderRadius: 12, fontWeight: 900,
  cursor: "pointer", fontSize: 14,
};

const smallBtn = {
  background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ede9fe",
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
  alignItems: "center", color: "#ef4444", flexShrink: 0,
};

const tinyIconBtn = {
  border: "none", background: "transparent", borderRadius: 6,
  padding: "3px 5px", cursor: "pointer", display: "flex",
  alignItems: "center", color: "#ef4444",
};

const emptyMsg = {
  fontSize: 12, color: "#9ca3af", textAlign: "center",
  padding: "10px 0", background: "#f9fafb",
  borderRadius: 8, marginBottom: 8,
};

const th = { textAlign: "left", padding: "4px 6px", fontWeight: 600 };
const td = { padding: "5px 6px", verticalAlign: "middle" };
