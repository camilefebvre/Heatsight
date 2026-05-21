// ─── Helpers purs ACV 2.0 ────────────────────────────────────────────────────
// Extraits de ProjectLCA2.jsx pour permettre les tests unitaires Vitest.
// Ces fonctions ne dépendent d'aucun état React ni d'aucune API externe.

// Normalise une chaîne : retire les accents, met en minuscules
export function normStr(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Vrai si la catégorie désigne une fenêtre, quelle que soit la casse/accentuation
export function isFenetreCategory(cat) {
  return normStr(cat) === "fenetre";
}

export function isIsolantCategory(cat) {
  return (cat || "").toLowerCase() === "isolant";
}

export function isCadreCategory(cat) {
  return (cat || "").toLowerCase() === "cadre";
}

// Convention (refonte Tâche 9) — Lambda de conductivité thermique (W/m·K).
// Priorité de lecture :
//   1. m.valeur_lambda          → colonne dédiée (refonte Tâche 9)
//   2. m.impacts.valeur_lambda  → clé JSONB (Phase 1, rétrocompat transition)
//   3. m.valeur_r si 0 < x < 0.5 et Isolant → Convention 1 ancienne (rétrocompat)
export function getLambda(m) {
  // Priorité 1 : colonne dédiée
  const fromColumn = parseFloat(m?.valeur_lambda);
  if (isFinite(fromColumn) && fromColumn > 0) return fromColumn;
  // Priorité 2 : clé JSONB (transition)
  const fromImpacts = parseFloat(m?.impacts?.valeur_lambda);
  if (isFinite(fromImpacts) && fromImpacts > 0) return fromImpacts;
  // Priorité 3 : Convention 1 rétrocompat (Isolant uniquement, valeur_r < 0.5)
  const fromR = parseFloat(m?.valeur_r);
  if (isIsolantCategory(m?.category) && isFinite(fromR) && fromR > 0 && fromR < 0.5) return fromR;
  return null;
}

// Types extérieurs reconnus dans paroi.type (enum : "mur", "toiture", "plancher", "cloison")
// et par mots-clés dans paroi.nom pour les imports / types futurs.
// Intérieurs : "cloison", tout nom contenant "interieur" ou "intermediaire".
export function isParoiExterieure(paroi) {
  const type = normStr(paroi.type || "");
  if (type === "cloison") return false;
  if (type === "mur" || type === "toiture" || type === "plancher") return true;
  const nom = normStr(paroi.nom || "");
  if (nom.includes("intermediaire") || nom.includes("interieur")) return false;
  if (nom.includes("exterieur") || nom.startsWith("ext")) return true;
  if (nom.includes("toit")) return true;
  if (nom.includes("plancher") || nom.includes("sol bas")) return true;
  return false;
}

// Paroi éligible à l'ajout d'un isolant : extérieure, sans isolant existant,
// avec au moins un composant opaque non-isolant (support physique requis).
export function isParoiEligibleAjoutIsolant(paroi) {
  if (!isParoiExterieure(paroi)) return false;
  const opaques = paroi.composantsOpaques || [];
  if (!opaques.some(co => !isIsolantCategory(co.category))) return false;
  return !opaques.some(co => isIsolantCategory(co.category));
}

// ─── R of a composant opaque (m²·K/W) — post-refonte conceptuelle ────────────
// r_local (override utilisateur) > r_cible (isolants) > lambda_lib (R direct non-isolants)
export function getComposantR(comp) {
  const rLocal = parseFloat(comp.r_local);
  if (isFinite(rLocal) && rLocal > 0) return rLocal;
  const rCible = parseFloat(comp.r_cible);
  if (isIsolantCategory(comp.category) && isFinite(rCible) && rCible > 0) return rCible;
  // Non-isolants : lambda_lib stocke valeur_r = R direct (nouvelle convention)
  if (!isIsolantCategory(comp.category)) {
    const rLib = parseFloat(comp.lambda_lib);
    if (isFinite(rLib) && rLib > 0) return rLib;
  }
  return null;
}

// ─── Génération des paliers d'épaisseur isolant (Phase 3) ─────────────────────
// Retourne [epMin, epMid, epMax] dédupliqués, ou [] si epMin > epIsoMax.
// epActuelle : épaisseur courante effective (cm)
// epIsoMax   : borne supérieure (cm)
// step       : pas commercial (cm), défaut 2.5
export function generateEpaisseurPaliers(epActuelle, epIsoMax, step = 2.5) {
  const epMinBase = Math.max(epActuelle, step);
  const epMin = Math.ceil(epMinBase / step) * step;
  if (epMin > epIsoMax) return [];
  const epMid = Math.round(((epMin + epIsoMax) / 2) / step) * step;
  const paliers = [epMin, epMid, epIsoMax];
  return [...new Set(paliers.map(ep => Math.round(ep * 100) / 100))]
    .filter(ep => ep <= epIsoMax + 0.01);
}

// ─── Clé de déduplication d'une combinaison ───────────────────────────────────
// Produit une signature stable (ordre-indépendante) pour un tableau de choices.
export function makeComboKey(choices) {
  return choices
    .slice()
    .sort((a, b) => (a.compId + a.type).localeCompare(b.compId + b.type))
    .map(c => `${c.compId}:${c.type}:${c.material_id}${c.epaisseur_cm != null ? `:e${c.epaisseur_cm}` : ""}`)
    .join("|");
}
