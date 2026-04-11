import { useEffect, useRef, useState } from "react";
import { Upload, Pencil, Copy, Trash2 } from "lucide-react";
import { apiFetch } from "../api";

// ─── Constantes ──────────────────────────────────────────────────────────────

const CATEGORIES = ["mur", "toiture", "plancher", "fenetre", "fondation", "autre"];
const CATEGORY_LABELS = {
  mur: "Mur", toiture: "Toiture", plancher: "Plancher",
  fenetre: "Fenêtre", fondation: "Fondation", autre: "Autre",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(v, d = 2) {
  if (v == null) return "—";
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(d);
}

function fmtImpact(v) {
  if (v == null) return "—";
  if (v === 0) return "0";
  if (Math.abs(v) < 0.001) return Number(v).toExponential(2);
  if (Math.abs(v) < 1)     return Number(v).toFixed(4);
  if (Math.abs(v) < 1000)  return Number(v).toFixed(2);
  return Math.round(v).toLocaleString("fr-BE");
}

const EMPTY_IMP_FORM = {
  file: null, name: "", category: "mur",
  functionalUnit: "", unit: "", prix: "", valeurR: "",
  importing: false, result: null,
};

// ─── 19 indicateurs EF v3.0 — ordre et unités fixes ─────────────────────────

const IMPACT_INDICATORS = [
  { label: "GWP100",                                  unit: "kg CO₂eq",      keys: ["gwp100"] },
  { label: "Acidification",                           unit: "mol H⁺ eq",     keys: ["acidification", "ap"] },
  { label: "Écotoxicité freshwater",                  unit: "CTUe",          keys: ["ecotoxicity_fw", "ecotoxicity freshwater", "freshwater ecotoxicity", "faetp"] },
  { label: "Énergie non renouvelable",                unit: "MJ",            keys: ["energy_nr", "penr", "nre", "non-renewable energy", "energy non-renewable"] },
  { label: "Eutrophisation freshwater",               unit: "kg P eq",       keys: ["eutrophication_fw", "eutrophication freshwater", "freshwater eutrophication", "ep_fw"] },
  { label: "Eutrophisation marine",                   unit: "kg N eq",       keys: ["eutrophication_marine", "eutrophication marine", "marine eutrophication", "ep_marine"] },
  { label: "Eutrophisation terrestre",                unit: "mol N eq",      keys: ["eutrophication_terrestrial", "eutrophication terrestrial", "terrestrial eutrophication", "ep_ter"] },
  { label: "Toxicité humaine carcinogène",            unit: "CTUh",          keys: ["human_toxicity_cancer", "human toxicity, cancer", "cancer human health effects", "htpe"] },
  { label: "Toxicité humaine non carcinogène",        unit: "CTUh",          keys: ["human_toxicity_non_cancer", "human toxicity, non-cancer", "non-cancer human health effects", "htpne"] },
  { label: "Rayonnements ionisants",                  unit: "kBq U²³⁵ eq",  keys: ["ionising_radiation", "ionising radiation", "ionizing radiation", "ir"] },
  { label: "Utilisation des terres",                  unit: "Pt",            keys: ["land_use", "land use", "lu"] },
  { label: "Ressources minérales",                    unit: "kg Sb eq",      keys: ["mineral_resources", "mineral resources", "resource use minerals", "mru"] },
  { label: "Appauvrissement ozone",                   unit: "kg CFC-11 eq",  keys: ["ozone_depletion", "ozone depletion", "odp"] },
  { label: "Particules fines",                        unit: "impact santé",  keys: ["particulate_matter", "particulate matter", "pm"] },
  { label: "Oxydants photochimiques",                 unit: "kg NMVOC eq",   keys: ["photochemical_ozone", "photochemical ozone formation", "pocp"] },
  { label: "Utilisation eau",                         unit: "m³ eq",         keys: ["water_use", "water use", "wu"] },
  { label: "Changement climatique biogénique",        unit: "kg CO₂eq",      keys: ["gwp_biogenic", "climate change biogenic", "gwp biogenic"] },
  { label: "Changement climatique fossile",           unit: "kg CO₂eq",      keys: ["gwp_fossil", "climate change fossil", "gwp fossil"] },
  { label: "Changement climatique usage des terres",  unit: "kg CO₂eq",      keys: ["gwp_luluc", "climate change land use", "gwp luluc"] },
];

/** Cherche une valeur d'impact en testant plusieurs noms de clés (insensible à la casse). */
function findImpact(impacts, keys) {
  if (!impacts) return null;
  const entries = Object.entries(impacts).map(([k, v]) => [k.toLowerCase(), v]);
  const map = Object.fromEntries(entries);
  for (const key of keys) {
    const v = map[key.toLowerCase()];
    if (v !== undefined) return v;
  }
  return null;
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function LCALibrary() {
  const [materials,    setMaterials]    = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Import
  const [impOpen,      setImpOpen]      = useState(false);
  const [imp,          setImp]          = useState(EMPTY_IMP_FORM);
  const fileInputRef                    = useRef(null);

  // Édition
  const [editModal,    setEditModal]    = useState(null); // null ou { id, name, category, prix, valeur_r, flux_reference, impacts }
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState("");

  // Suppression
  const [confirmDel,   setConfirmDel]   = useState(null); // id
  const [deleting,     setDeleting]     = useState(false);

  // Duplication
  const [duplicating,  setDuplicating]  = useState(null); // id en cours

  // Fiche matériau (lecture seule, double-clic)
  const [ficheModal,   setFicheModal]   = useState(null); // null ou matériau

  // ── Chargement ─────────────────────────────────────────────────────────────
  async function loadMaterials() {
    setLoading(true);
    try {
      const res = await apiFetch("/lca/materials");
      if (res.ok) setMaterials(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMaterials(); }, []);

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport(e) {
    e.preventDefault();
    setImp((s) => ({ ...s, importing: true, result: null }));
    try {
      const fd = new FormData();
      fd.append("file", imp.file);
      fd.append("name", imp.name.trim());
      fd.append("category", imp.category);
      fd.append("functional_unit", imp.functionalUnit.trim());
      fd.append("unit", imp.unit.trim());
      fd.append("prix", imp.prix);
      fd.append("valeur_r", imp.valeurR);
      const res = await apiFetch("/lca/materials/import", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Erreur inconnue" }));
        setImp((s) => ({ ...s, importing: false, result: { ok: false, message: err.detail || "Import échoué" } }));
        return;
      }
      const mat = await res.json();
      setImp((s) => ({
        ...s, importing: false,
        result: { ok: true, message: `"${mat.name}" importé avec succès (${Object.keys(mat.impacts || {}).length} indicateurs).` },
      }));
      await loadMaterials();
    } catch {
      setImp((s) => ({ ...s, importing: false, result: { ok: false, message: "Erreur réseau." } }));
    }
  }

  // ── Édition ────────────────────────────────────────────────────────────────
  function openEdit(mat) {
    setEditModal({
      id: mat.id,
      name: mat.name,
      category: mat.category,
      prix: mat.prix ?? "",
      valeur_r: mat.valeur_r ?? "",
      flux_reference: mat.flux_reference ?? "",
      impacts: mat.impacts || {},
    });
    setSaveError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name: editModal.name.trim() || undefined,
        category: editModal.category || undefined,
        prix: editModal.prix !== "" ? Number(editModal.prix) : undefined,
        valeur_r: editModal.valeur_r !== "" ? Number(editModal.valeur_r) : undefined,
        flux_reference: editModal.flux_reference !== "" ? Number(editModal.flux_reference) : undefined,
      };
      const res = await apiFetch(`/lca/materials/${editModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Erreur" }));
        setSaveError(err.detail || "Sauvegarde échouée");
        return;
      }
      setEditModal(null);
      await loadMaterials();
    } catch {
      setSaveError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  }

  // ── Duplication ────────────────────────────────────────────────────────────
  async function handleDuplicate(id) {
    setDuplicating(id);
    try {
      const res = await apiFetch(`/lca/materials/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        const copy = await res.json();
        setMaterials((prev) => [...prev, copy]);
      }
    } finally {
      setDuplicating(null);
    }
  }

  // ── Suppression ────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    setDeleting(true);
    try {
      const res = await apiFetch(`/lca/materials/${id}`, { method: "DELETE" });
      if (res.ok) setMaterials((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setDeleting(false);
      setConfirmDel(null);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const gwpKey = (impacts) => {
    // Le nom de la clé GWP100 peut varier selon la source (gwp100, GWP100, etc.)
    const k = Object.keys(impacts || {}).find((k) => k.toLowerCase() === "gwp100");
    return k ? impacts[k] : null;
  };

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Gestion & Administration</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
        🌿 Bibliothèque ACV
      </h1>
      <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
        Gérez les matériaux de la bibliothèque partagée : importez, modifiez, dupliquez ou supprimez.
      </div>

      {/* ── Barre d'actions ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setImp(EMPTY_IMP_FORM); setImpOpen(true); }}
          style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <Upload size={15} /> Importer un matériau
        </button>
      </div>

      {/* ── Tableau des matériaux ────────────────────────────────────────────── */}
      <div style={card}>
        {loading ? (
          <div style={{ color: "#9ca3af", fontSize: 14, padding: "12px 0" }}>Chargement…</div>
        ) : materials.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 14, padding: "12px 0" }}>
            Aucun matériau. Utilisez "Importer un matériau" pour commencer.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa", color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <th style={th}>Nom</th>
                  <th style={th}>Catégorie</th>
                  <th style={th}>Unité</th>
                  <th style={{ ...th, textAlign: "right" }}>Prix (€)</th>
                  <th style={{ ...th, textAlign: "right" }}>Valeur R</th>
                  <th style={{ ...th, textAlign: "right" }}>Flux ref</th>
                  <th style={{ ...th, textAlign: "right" }}>GWP100</th>
                  <th style={{ ...th, textAlign: "right", width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((mat) => (
                  <tr
                    key={mat.id}
                    style={{ borderTop: "1px solid #f3f4f6", cursor: "pointer" }}
                    onDoubleClick={() => setFicheModal(mat)}
                  >
                    <td style={{ ...td, fontWeight: 700, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {mat.name}
                    </td>
                    <td style={{ ...td, color: "#6b7280" }}>
                      {CATEGORY_LABELS[mat.category] || mat.category}
                    </td>
                    <td style={{ ...td, color: "#9ca3af", fontSize: 12 }}>{mat.unit}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {mat.prix != null ? fmtNum(mat.prix) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {mat.valeur_r != null ? fmtNum(mat.valeur_r) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#9ca3af" }}>
                      {mat.flux_reference != null ? fmtNum(mat.flux_reference, 4) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#6d28d9", fontWeight: 700 }}>
                      {fmtImpact(gwpKey(mat.impacts))}
                    </td>
                    <td
                      style={{ ...td, textAlign: "right" }}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      {confirmDel === mat.id ? (
                        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(mat.id)}
                            disabled={deleting}
                            style={dangerBtn}
                          >
                            {deleting ? "…" : "Confirmer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDel(null)}
                            style={cancelBtn}
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <ActionBtn
                            title="Modifier"
                            onClick={() => openEdit(mat)}
                          >
                            <Pencil size={13} />
                          </ActionBtn>
                          <ActionBtn
                            title="Dupliquer"
                            onClick={() => handleDuplicate(mat.id)}
                            disabled={duplicating === mat.id}
                          >
                            <Copy size={13} />
                          </ActionBtn>
                          <ActionBtn
                            title="Supprimer"
                            onClick={() => setConfirmDel(mat.id)}
                            danger
                          >
                            <Trash2 size={13} />
                          </ActionBtn>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modale : Import XLSX ─────────────────────────────────────────────── */}
      {impOpen && (
        <div
          style={overlay}
          onClick={(e) => { if (e.target === e.currentTarget) setImpOpen(false); }}
        >
          <div style={modal}>
            <ModalHeader title="Importer un matériau XLSX" onClose={() => setImpOpen(false)} />

            <form onSubmit={handleImport}>
              {/* Zone de dépôt */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${imp.file ? "#6d28d9" : "#d1d5db"}`,
                  borderRadius: 12, padding: "18px 16px", textAlign: "center",
                  cursor: "pointer", background: imp.file ? "#faf5ff" : "#fafafa", marginBottom: 14,
                }}
              >
                <Upload size={20} color={imp.file ? "#6d28d9" : "#9ca3af"} style={{ margin: "0 auto 6px" }} />
                {imp.file ? (
                  <div>
                    <div style={{ fontWeight: 700, color: "#6d28d9", fontSize: 14 }}>{imp.file.name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{(imp.file.size / 1024).toFixed(1)} Ko — cliquez pour changer</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, color: "#374151", fontSize: 14 }}>Cliquez pour sélectionner un fichier .xlsx</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Format LCIA-results EF v3.0</div>
                  </div>
                )}
                <input
                  ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }}
                  onChange={(e) => setImp((s) => ({ ...s, file: e.target.files[0] || null, result: null }))}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <FormField label="Nom du matériau *">
                  <input value={imp.name} onChange={(e) => setImp((s) => ({ ...s, name: e.target.value }))} style={inputStyle} placeholder="Ex : Béton armé C25/30" required />
                </FormField>
                <FormField label="Catégorie *">
                  <select value={imp.category} onChange={(e) => setImp((s) => ({ ...s, category: e.target.value }))} style={inputStyle}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </FormField>
                <FormField label="Unité fonctionnelle *">
                  <input value={imp.functionalUnit} onChange={(e) => setImp((s) => ({ ...s, functionalUnit: e.target.value }))} style={inputStyle} placeholder="Ex : m² de mur" required />
                </FormField>
                <FormField label="Unité *">
                  <input value={imp.unit} onChange={(e) => setImp((s) => ({ ...s, unit: e.target.value }))} style={inputStyle} placeholder="Ex : m²" required />
                </FormField>
                <FormField label="Prix (€/unité) *">
                  <input type="number" min="0" step="any" value={imp.prix} onChange={(e) => setImp((s) => ({ ...s, prix: e.target.value }))} style={inputStyle} placeholder="85.00" required />
                </FormField>
                <FormField label="Valeur R (m²K/W) *">
                  <input type="number" min="0" step="any" value={imp.valeurR} onChange={(e) => setImp((s) => ({ ...s, valeurR: e.target.value }))} style={inputStyle} placeholder="3.5" required />
                </FormField>
              </div>

              <button
                type="submit"
                disabled={imp.importing || !imp.file || !imp.name.trim() || !imp.functionalUnit.trim() || !imp.unit.trim() || imp.prix === "" || imp.valeurR === ""}
                style={{
                  ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: (imp.importing || !imp.file || !imp.name.trim() || imp.prix === "" || imp.valeurR === "") ? 0.55 : 1,
                }}
              >
                <Upload size={14} />
                {imp.importing ? "Import en cours…" : "Importer le matériau"}
              </button>
            </form>

            {imp.result && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 10,
                background: imp.result.ok ? "#dcfce7" : "#fee2e2",
                color: imp.result.ok ? "#166534" : "#991b1b",
                fontWeight: 600, fontSize: 13,
              }}>
                {imp.result.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modale : Fiche matériau (lecture seule) ─────────────────────────── */}
      {ficheModal && (
        <div
          style={overlay}
          onClick={(e) => { if (e.target === e.currentTarget) setFicheModal(null); }}
        >
          <div style={{ ...modal, width: 620 }}>
            <ModalHeader title={ficheModal.name} onClose={() => setFicheModal(null)} />

            {/* Section 1 — Informations générales */}
            <div style={sectionLabel}>Informations générales</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", marginBottom: 22 }}>
              <InfoRow label="Catégorie"            value={CATEGORY_LABELS[ficheModal.category] || ficheModal.category} />
              <InfoRow label="Unité fonctionnelle"  value={ficheModal.functional_unit || "—"} />
              <InfoRow label="Prix (€)"             value={ficheModal.prix != null ? `${fmtNum(ficheModal.prix)} €` : "—"} />
              <InfoRow label="Valeur R (m²K/W)"     value={ficheModal.valeur_r != null ? fmtNum(ficheModal.valeur_r) : "—"} />
              <InfoRow label="Flux ref (kg/m²·K/W)" value={ficheModal.flux_reference != null ? fmtNum(ficheModal.flux_reference, 4) : "—"} />
            </div>

            {/* Section 2 — Impacts EF v3.0 */}
            <div style={sectionLabel}>Impacts environnementaux EF v3.0</div>
            <div style={{ border: "1px solid #f3f4f6", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    <th style={{ padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left" }}>
                      Indicateur
                    </th>
                    <th style={{ padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "right" }}>
                      Valeur
                    </th>
                    <th style={{ padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left", width: 150 }}>
                      Unité
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {IMPACT_INDICATORS.map((ind, i) => {
                    const raw = findImpact(ficheModal.impacts, ind.keys);
                    const isEmpty = raw == null || raw === 0;
                    return (
                      <tr key={i} style={{ borderTop: "1px solid #f9fafb" }}>
                        <td style={{ padding: "6px 12px", fontSize: 13, color: "#374151" }}>{ind.label}</td>
                        <td style={{ padding: "6px 12px", fontSize: 13, fontWeight: isEmpty ? 400 : 700, color: isEmpty ? "#d1d5db" : "#6d28d9", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {isEmpty ? "—" : fmtImpact(raw)}
                        </td>
                        <td style={{ padding: "6px 12px", fontSize: 12, color: "#9ca3af" }}>{ind.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale : Édition ─────────────────────────────────────────────────── */}
      {editModal && (
        <div
          style={overlay}
          onClick={(e) => { if (e.target === e.currentTarget) setEditModal(null); }}
        >
          <div style={{ ...modal, width: 580 }}>
            <ModalHeader title="Modifier le matériau" onClose={() => setEditModal(null)} />

            <form onSubmit={handleSave}>
              {/* Champs éditables */}
              <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Champs éditables
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                <FormField label="Nom">
                  <input
                    value={editModal.name}
                    onChange={(e) => setEditModal((s) => ({ ...s, name: e.target.value }))}
                    style={inputStyle}
                    required
                  />
                </FormField>
                <FormField label="Catégorie">
                  <select
                    value={editModal.category}
                    onChange={(e) => setEditModal((s) => ({ ...s, category: e.target.value }))}
                    style={inputStyle}
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </FormField>
                <FormField label="Prix (€/unité)">
                  <input
                    type="number" min="0" step="any"
                    value={editModal.prix}
                    onChange={(e) => setEditModal((s) => ({ ...s, prix: e.target.value }))}
                    style={inputStyle}
                    placeholder="—"
                  />
                </FormField>
                <FormField label="Valeur R (m²K/W)">
                  <input
                    type="number" min="0" step="any"
                    value={editModal.valeur_r}
                    onChange={(e) => setEditModal((s) => ({ ...s, valeur_r: e.target.value }))}
                    style={inputStyle}
                    placeholder="—"
                  />
                </FormField>
                <FormField label="Flux référence (kg/(m²·K/W))">
                  <input
                    type="number" min="0" step="any"
                    value={editModal.flux_reference}
                    onChange={(e) => setEditModal((s) => ({ ...s, flux_reference: e.target.value }))}
                    style={inputStyle}
                    placeholder="— (isolants uniquement)"
                  />
                </FormField>
              </div>

              {/* Impacts EF v3.0 — lecture seule */}
              {Object.keys(editModal.impacts).length > 0 && (
                <>
                  <div style={{ marginBottom: 10, fontWeight: 700, fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Impacts EF v3.0 — lecture seule
                  </div>
                  <div style={{ border: "1px solid #f3f4f6", borderRadius: 10, overflowX: "auto", marginBottom: 18 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        {Object.entries(editModal.impacts).map(([key, val]) => (
                          <tr key={key} style={{ borderTop: "1px solid #f9fafb" }}>
                            <td style={{ padding: "5px 10px", fontSize: 12, color: "#6b7280", width: "60%" }}>{key}</td>
                            <td style={{ padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#374151", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                              {fmtImpact(val)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {saveError && (
                <div style={{ marginBottom: 12, color: "#991b1b", fontSize: 13, fontWeight: 600 }}>{saveError}</div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setEditModal(null)} style={cancelBtn}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Sauvegarde…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
      <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>{title}</div>
      <button
        type="button"
        onClick={onClose}
        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#111827", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function ActionBtn({ children, title, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "1px solid #e5e7eb",
        background: "white",
        borderRadius: 7,
        padding: "4px 7px",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        color: danger ? "#ef4444" : "#6b7280",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const card = {
  background: "white", borderRadius: 16,
  padding: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const th = { padding: "8px 12px", fontWeight: 700 };
const td = { padding: "9px 12px", fontSize: 13, verticalAlign: "middle" };

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1.5px solid #e5e7eb", outline: "none",
  fontSize: 14, color: "#111827", background: "white", boxSizing: "border-box",
};

const primaryBtn = {
  background: "#6d28d9", color: "white", border: "none",
  padding: "10px 14px", borderRadius: 12, fontWeight: 900,
  cursor: "pointer", fontSize: 14,
};

const dangerBtn = {
  background: "#ef4444", color: "white", border: "none",
  borderRadius: 7, fontWeight: 700, cursor: "pointer",
  fontSize: 12, padding: "4px 10px",
};

const cancelBtn = {
  background: "white", color: "#6b7280",
  border: "1px solid #e5e7eb", borderRadius: 10,
  fontWeight: 600, cursor: "pointer",
  fontSize: 13, padding: "8px 14px",
};

const overlay = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.45)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const modal = {
  background: "white", borderRadius: 16,
  padding: 24, width: 520, maxWidth: "94vw",
  maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
};

const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: "#9ca3af",
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 10,
};
