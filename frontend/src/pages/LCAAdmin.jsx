import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Trash2, ArrowLeft } from "lucide-react";
import { apiFetch } from "../api";

const CATEGORIES = ["mur", "toiture", "plancher", "fenetre", "fondation", "autre"];
const CATEGORY_LABELS = {
  mur: "Mur", toiture: "Toiture", plancher: "Plancher",
  fenetre: "Fenêtre", fondation: "Fondation", autre: "Autre",
};

export default function LCAAdmin() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [materials, setMaterials]     = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // Form state
  const [file, setFile]                   = useState(null);
  const [name, setName]                   = useState("");
  const [category, setCategory]           = useState("mur");
  const [functionalUnit, setFunctionalUnit] = useState("");
  const [unit, setUnit]                   = useState("");

  // UI state
  const [importing, setImporting]         = useState(false);
  const [importResult, setImportResult]   = useState(null); // { ok, message, indicators }
  const [deletingId, setDeletingId]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // material id pending confirm

  // ── Chargement de la liste ───────────────────────────────────────────────
  async function loadMaterials() {
    try {
      setLoadingList(true);
      const res = await apiFetch("/lca/materials");
      if (!res.ok) throw new Error();
      setMaterials(await res.json());
    } catch {
      setMaterials([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { loadMaterials(); }, []);

  // ── Import ───────────────────────────────────────────────────────────────
  async function handleImport(e) {
    e.preventDefault();
    if (!file || !name.trim() || !functionalUnit.trim() || !unit.trim()) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name.trim());
      formData.append("category", category);
      formData.append("functional_unit", functionalUnit.trim());
      formData.append("unit", unit.trim());

      const res = await apiFetch("/lca/materials/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Erreur inconnue" }));
        setImportResult({ ok: false, message: err.detail || "Import échoué" });
        return;
      }

      const mat = await res.json();
      const indicators = Object.keys(mat.impacts || {});
      setImportResult({
        ok: true,
        message: `"${mat.name}" importé avec succès.`,
        indicators,
      });

      // Reset form
      setFile(null);
      setName("");
      setFunctionalUnit("");
      setUnit("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      await loadMaterials();
    } catch {
      setImportResult({ ok: false, message: "Erreur réseau lors de l'import." });
    } finally {
      setImporting(false);
    }
  }

  // ── Suppression ──────────────────────────────────────────────────────────
  async function handleDelete(id) {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/lca/materials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silently fail — list reload will reflect real state
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, width: "100%" }}>

      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        style={backBtn}
      >
        <ArrowLeft size={14} />
        Tableau de bord
      </button>

      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 12 }}>Administration</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
        Bibliothèque de matériaux ACV
      </h1>
      <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
        Importez des matériaux depuis un fichier LCIA-results.xlsx au format EF v3.0.
      </div>

      {/* ── Section import ──────────────────────────────────────────────── */}
      <div style={card}>
        <h2 style={sectionTitle}>Importer un matériau</h2>

        <form onSubmit={handleImport}>
          {/* Upload zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${file ? "#6d28d9" : "#d1d5db"}`,
              borderRadius: 12,
              padding: "24px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: file ? "#faf5ff" : "#fafafa",
              marginBottom: 16,
              transition: "border-color 0.2s, background 0.2s",
            }}
          >
            <Upload size={22} color={file ? "#6d28d9" : "#9ca3af"} style={{ margin: "0 auto 8px" }} />
            {file ? (
              <div>
                <div style={{ fontWeight: 700, color: "#6d28d9", fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  {(file.size / 1024).toFixed(1)} Ko — cliquez pour changer
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 600, color: "#374151", fontSize: 14 }}>
                  Cliquez pour sélectionner un fichier .xlsx
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  Format LCIA-results EF v3.0
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(e) => { setFile(e.target.files[0] || null); setImportResult(null); }}
            />
          </div>

          {/* Champs du formulaire */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Field label="Nom du matériau *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Ex : Béton armé C25/30"
                required
              />
            </Field>

            <Field label="Catégorie *">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </Field>

            <Field label="Unité fonctionnelle *">
              <input
                value={functionalUnit}
                onChange={(e) => setFunctionalUnit(e.target.value)}
                style={inputStyle}
                placeholder="Ex : m² de mur"
                required
              />
            </Field>

            <Field label="Unité *">
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={inputStyle}
                placeholder="Ex : m²"
                required
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={importing || !file || !name.trim() || !functionalUnit.trim() || !unit.trim()}
            style={{
              ...primaryBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              opacity: (importing || !file || !name.trim()) ? 0.55 : 1,
            }}
          >
            <Upload size={15} />
            {importing ? "Import en cours…" : "Importer le matériau"}
          </button>
        </form>

        {/* Résultat de l'import */}
        {importResult && (
          <div style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: importResult.ok ? "#dcfce7" : "#fee2e2",
            color: importResult.ok ? "#166534" : "#991b1b",
            fontWeight: 600,
            fontSize: 14,
          }}>
            {importResult.message}
            {importResult.ok && importResult.indicators?.length > 0 && (
              <div style={{ marginTop: 8, fontWeight: 400, fontSize: 12 }}>
                <strong>{importResult.indicators.length} indicateurs extraits :</strong>{" "}
                {importResult.indicators.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section liste ────────────────────────────────────────────────── */}
      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={sectionTitle}>
          Matériaux existants
          {!loadingList && (
            <span style={{ fontSize: 13, fontWeight: 500, color: "#9ca3af", marginLeft: 8 }}>
              ({materials.length})
            </span>
          )}
        </h2>

        {loadingList ? (
          <div style={{ color: "#9ca3af", fontSize: 14, padding: "8px 0" }}>Chargement…</div>
        ) : materials.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 14, padding: "8px 0" }}>
            Aucun matériau dans la bibliothèque.
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #eef2f7", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafafa", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
                  <th style={th}>Nom</th>
                  <th style={th}>Catégorie</th>
                  <th style={th}>Unité fonctionnelle</th>
                  <th style={{ ...th, textAlign: "right" }}>GWP100 / unité</th>
                  <th style={{ ...th, textAlign: "center" }}>Indicateurs</th>
                  <th style={{ ...th, width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {materials.map((mat) => (
                  <tr key={mat.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{mat.name}</td>
                    <td style={td}>{CATEGORY_LABELS[mat.category] || mat.category}</td>
                    <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>{mat.functional_unit}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#6d28d9", fontWeight: 700 }}>
                      {mat.impacts?.GWP100 != null ? `${mat.impacts.GWP100} kg CO₂ eq` : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <span style={{ background: "#f3f4f6", borderRadius: 8, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
                        {Object.keys(mat.impacts || {}).length}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {confirmDelete === mat.id ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(mat.id)}
                            disabled={deletingId === mat.id}
                            style={{ ...dangerBtn, fontSize: 12, padding: "4px 10px" }}
                          >
                            {deletingId === mat.id ? "…" : "Confirmer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            style={{ ...cancelBtn, fontSize: 12, padding: "4px 10px" }}
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(mat.id)}
                          style={iconBtn}
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const card = {
  background: "white",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const sectionTitle = {
  margin: "0 0 16px",
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const th = { padding: "10px 14px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const td = { padding: "12px 14px", fontSize: 14, verticalAlign: "middle" };

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1.5px solid #e5e7eb",
  outline: "none",
  fontSize: 14,
  color: "#111827",
  background: "white",
  boxSizing: "border-box",
};

const primaryBtn = {
  background: "#6d28d9",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 14,
};

const iconBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 8,
  padding: "6px 8px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  color: "#ef4444",
};

const dangerBtn = {
  background: "#ef4444",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const cancelBtn = {
  background: "white",
  color: "#6b7280",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};

const backBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 10,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#6b7280",
  cursor: "pointer",
};
