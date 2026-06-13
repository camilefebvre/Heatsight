import { useEffect, useRef, useState } from "react";
import { Upload, Download, Trash2 } from "lucide-react";
import { apiFetch } from "../api";

const CFG = {
  audit: {
    title: "Modèles d'audit (Excel)", ext: ".xlsx", accept: ".xlsx",
    help: "Partez du modèle officiel : ne déplacez ni les feuilles (AA1–AA9) ni les cellules, sinon l'import ne pourra pas relire vos données.",
  },
  report: {
    title: "Modèles de rapport (Word)", ext: ".docx", accept: ".docx",
    help: "Téléchargez le modèle officiel comme point de départ, puis complétez-le manuellement.",
  },
};

export default function TemplateLibraryPanel({ type, projectId, activeTemplateId, onActiveChange, onCapabilityChange }) {
  const cfg = CFG[type];
  const [templates, setTemplates] = useState([]);
  const [active, setActive] = useState(activeTemplateId ?? null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { setActive(activeTemplateId ?? null); }, [activeTemplateId]);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await apiFetch(`/templates?type=${type}`);
      if (!res.ok) throw new Error();
      setTemplates(await res.json());
    } catch { setError("Impossible de charger les modèles."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [type]);

  const officialId = templates.find((t) => t.is_official)?.id || null;
  const effectiveActive = active ?? officialId;   // null projet ⇒ officiel sélectionné

  // Remonte la capacité (prefill IA) du modèle actif au chargement ET à chaque changement.
  useEffect(() => {
    if (loading) return;
    const act = templates.find((t) => t.id === effectiveActive);
    onCapabilityChange?.(act ? act.supports_prefill : true);
    // onCapabilityChange volontairement hors deps (callback parent non mémoïsé)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, effectiveActive, templates]);

  async function selectTemplate(id) {
    if (busy || id === effectiveActive) return;
    setBusy(true); setError("");
    try {
      const res = await apiFetch(`/projects/${projectId}/active-template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, template_id: id }),
      });
      if (!res.ok) throw new Error();
      setActive(id); onActiveChange?.(id);
    } catch { setError("La sélection a échoué."); }
    finally { setBusy(false); }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(cfg.ext)) { setError(`Extension attendue : ${cfg.ext}`); return; }
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("name", file.name.replace(/\.[^.]+$/, ""));
      fd.append("file", file);
      const res = await apiFetch("/templates", { method: "POST", body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Upload refusé"); }
      await load();
    } catch (e2) { setError(e2.message || "Upload refusé."); }
    finally { setBusy(false); }
  }

  async function handleDelete(t) {
    const msg = t.usage_count > 0
      ? `« ${t.name} » est actif sur ${t.usage_count} projet(s). Le supprimer les fera repasser au modèle officiel. Continuer ?`
      : `Supprimer le modèle « ${t.name} » ?`;
    if (!window.confirm(msg)) return;
    setBusy(true); setError("");
    try {
      const res = await apiFetch(`/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (t.id === active) { setActive(null); onActiveChange?.(null); }
      await load();
    } catch { setError("Suppression impossible."); }
    finally { setBusy(false); }
  }

  async function handleDownload(t) {
    setError("");
    try {
      const res = await apiFetch(`/templates/${t.id}/file`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${t.name}${cfg.ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Téléchargement impossible."); }
  }

  return (
    <div style={{ background: "white", borderRadius: 16, border: "1px solid #ede9fe", padding: "16px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, color: "#59169c" }}>≡</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#111827", lineHeight: 1.25 }}>{cfg.title}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>Modèle utilisé pour ce projet</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 13, padding: "12px 0" }}>Chargement…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
          {templates.map((t) => {
            const checked = t.id === effectiveActive;
            return (
              <label key={t.id} className="hs-clickable"
                style={{ display: "block", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  background: checked ? "#faf5ff" : "white", border: `1px solid ${checked ? "#c4b5fd" : "#e5e7eb"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="radio" name={`tpl-${type}`} checked={checked} disabled={busy}
                    onChange={() => selectTemplate(t.id)} style={{ accentColor: "#59169c", cursor: "pointer", flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#374151", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, flexShrink: 0,
                    background: t.is_official ? "#ede9fe" : "#f3f4f6", color: t.is_official ? "#59169c" : "#6b7280" }}>
                    {t.is_official ? "Officiel" : "Perso"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, paddingLeft: 24 }}>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{t.supports_prefill ? "Pré-remplissage IA" : "Remplissage manuel"}</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" title="Télécharger ce modèle" style={iconBtn}
                    onClick={(e) => { e.preventDefault(); handleDownload(t); }}>
                    <Download size={13} /> {t.is_official ? "Partir de l'officiel" : "Télécharger"}
                  </button>
                  {!t.is_official && (
                    <button type="button" title="Supprimer ce modèle" disabled={busy} style={delBtn}
                      onClick={(e) => { e.preventDefault(); handleDelete(t); }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept={cfg.accept} style={{ display: "none" }} onChange={handleUpload} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
        style={{ marginTop: 12, width: "100%", border: "1px solid #c4b5fd", background: "white", color: "#59169c",
          padding: "9px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.6 : 1 }}>
        <Upload size={14} /> Ajouter un modèle ({cfg.ext})
      </button>

      <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", lineHeight: 1.5, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
        {cfg.help}
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#8f1d2f" }}>{error}</div>}
    </div>
  );
}

const iconBtn = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #c4b5fd",
  background: "white", color: "#59169c", padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const delBtn = { display: "inline-flex", alignItems: "center", border: "1px solid #fecaca",
  background: "#fff1f1", color: "#ca2946", padding: "3px 8px", borderRadius: 6, cursor: "pointer", flexShrink: 0 };
