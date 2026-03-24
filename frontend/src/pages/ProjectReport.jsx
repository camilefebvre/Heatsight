import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Save } from "lucide-react";
import { useProject } from "../state/ProjectContext";
import { apiFetch } from "../api";

export default function ProjectReport() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { setSelectedProjectId } = useProject();

  // Sync le context sidebar si on arrive directement sur l'URL
  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzedDocsCount, setAnalyzedDocsCount] = useState(0);

  useEffect(() => {
    apiFetch(`/projects/${projectId}/documents`)
      .then((r) => (r.ok ? r.json() : []))
      .then((docs) => setAnalyzedDocsCount(docs.filter((d) => d.status === "analyzed").length))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // ✅ doit matcher le backend: report_data = { audit_type, audit_theme, provider_company, auditor_name, amureba_skills }
  const [report, setReport] = useState({
    audit_type: "Audit GLOBAL",
    audit_theme: "",
    provider_company: "",
    auditor_name: "",
    amureba_skills: "",
  });

  async function loadAll() {
    setLoading(true);
    setError("");
    setOkMsg("");

    try {
      // 1) Project
      const res = await apiFetch(`/projects`);
      if (!res.ok) throw new Error(`GET /projects failed (${res.status})`);
      const list = await res.json();
      const p = list.find((x) => x.id === projectId);
      setProject(p || null);

      // 2) Report data
      const resR = await apiFetch(`/projects/${projectId}/report`);
      if (!resR.ok) throw new Error(`GET /report failed (${resR.status})`);
      const data = await resR.json();

      // merge léger
      setReport((prev) => ({ ...prev, ...(data || {}) }));

      // petit confort: si vide, proposer une valeur par défaut
      if (p && (!data || !data.provider_company)) {
        setReport((prev) => ({ ...prev, provider_company: "Heat Sight" }));
      }
    } catch (e) {
      setError(e.message || "Load failed");
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function updateField(k, v) {
    setReport((prev) => ({ ...prev, [k]: v }));
  }

  async function saveReport() {
    try {
      setBusy(true);
      setError("");
      setOkMsg("");

      const res = await apiFetch(`/projects/${projectId}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_data: report }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Save failed");
      }

      setOkMsg("Rapport sauvegardé ✅");
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAndDownload() {
    try {
      setBusy(true);
      setError("");
      setOkMsg("");

      // 1) Sauvegarde d'abord
      const res = await apiFetch(`/projects/${projectId}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_data: report }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Save failed");
      }

      // 2) Téléchargement via fetch (token JWT dans le header)
      const dlRes = await apiFetch(`/projects/${projectId}/report/docx`);
      if (!dlRes.ok) throw new Error(`Génération échouée (${dlRes.status})`);
      const blob = await dlRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (project.project_name || "projet")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\w\-]/g, "");
      a.download = `${safeName}_rapport.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
      setOkMsg("Rapport sauvegardé et téléchargé ✅");
    } catch (e) {
      setError(e.message || "Erreur lors de la génération du rapport");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ color: "#6b7280" }}>Loading…</div>;
  if (!project) return <div style={{ color: "#6b7280" }}>Project not found.</div>;

  return (
    <div style={{ maxWidth: 1100, width: "100%" }}>
      <div style={{ color: "#6b7280" }}>Projet</div>
      <h1 style={{ fontSize: 36, margin: "6px 0 6px" }}>
        Rapport — {project.project_name}
      </h1>
      <div style={{ color: "#6b7280" }}>
        Remplis la page de garde, sauvegarde, puis télécharge le document Word.
      </div>

      {analyzedDocsCount > 0 && (
        <div style={{ marginTop: 10, padding: "8px 14px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, fontSize: 13, color: "#4c1d95", display: "flex", alignItems: "center", gap: 8 }}>
          📄 {analyzedDocsCount} document{analyzedDocsCount > 1 ? "s" : ""} analysé{analyzedDocsCount > 1 ? "s" : ""} disponible{analyzedDocsCount > 1 ? "s" : ""}
          <button
            type="button"
            onClick={() => navigate(`/projects/${projectId}/documents`)}
            style={{ background: "none", border: "none", color: "#7c3aed", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13 }}
          >
            → Voir les documents
          </button>
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}
      {okMsg && <div style={okBox}>{okMsg}</div>}

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Type d'audit">
            <select
              value={report.audit_type}
              onChange={(e) => updateField("audit_type", e.target.value)}
              style={inputStyle}
            >
              <option>Audit GLOBAL</option>
              <option>Audit Partiel</option>
            </select>
          </Field>

          <Field label="Thématique (global ou partiel)">
            <input
                value={report.audit_theme}
                onChange={(e) => updateField("audit_theme", e.target.value)}
                style={inputStyle}
                placeholder="Ex: Audit global – bâtiment complet / ou thématique HVAC..."
            />
          </Field>

          <Field label="Nom du prestataire (entreprise)">
            <SourcedInput
              value={report.provider_company}
              onChange={(e) => updateField("provider_company", e.target.value)}
              style={inputStyle}
              placeholder="Ex: Heat Sight SRL"
              fieldSource={report.field_sources?.provider_company}
            />
          </Field>

          <Field label="Nom / prénom de l'auditeur(trice) responsable">
            <SourcedInput
              value={report.auditor_name}
              onChange={(e) => updateField("auditor_name", e.target.value)}
              style={inputStyle}
              placeholder="Ex: Camille ..."
              fieldSource={report.field_sources?.auditor_name}
            />
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Compétence(s) AMUREBA exercée(s) dans ce rapport">
              <textarea
                rows={3}
                value={report.amureba_skills}
                onChange={(e) => updateField("amureba_skills", e.target.value)}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="Ex: Audit global, Audit partiel, ..."
              />
            </Field>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
          <button
            type="button"
            onClick={saveReport}
            disabled={busy}
            style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 8, opacity: busy ? 0.7 : 1 }}
          >
            <Save size={15} />
            {busy ? "..." : "Sauvegarder"}
          </button>

          <button
            type="button"
            onClick={saveAndDownload}
            disabled={busy}
            style={{ ...downloadBtn, display: "flex", alignItems: "center", gap: 8, opacity: busy ? 0.7 : 1 }}
          >
            <Download size={15} />
            {busy ? "..." : "Sauvegarder + Télécharger (Word)"}
          </button>
        </div>
      </div>

      {/* ── Section informative ───────────────────────────────────────────────── */}
      <div style={infoCard}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#374151", marginBottom: 4 }}>
          Contenu du rapport Word généré
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Le fichier .docx téléchargé contient les sections suivantes, remplies automatiquement depuis les données du projet.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <InfoBlock
            number="1"
            title="Page de garde"
            description="Titre du projet, coordonnées du client, type d'audit, nom de l'auditeur et compétences AMUREBA."
          />
          <InfoBlock
            number="2"
            title="Données du bâtiment"
            description="Adresse, type de bâtiment, surface, année de construction et usage principal du site audité."
          />
          <InfoBlock
            number="3"
            title="Consommations énergétiques"
            description="Totaux annuels par vecteur (electricity, gaz, fuel…) importés depuis la Comptabilité énergétique."
          />
          <InfoBlock
            number="4"
            title="Indices AMUREBA"
            description="Indicateurs normalisés calculés à partir des données d'audit et de comptabilité énergétique."
          />
        </div>
      </div>
    </div>
  );
}

/* UI */
function SourcedInput({ value, onChange, style, placeholder, fieldSource }) {
  const [showTip, setShowTip] = useState(false);
  const inputSt = fieldSource ? { ...style, borderLeft: "3px solid #7c3aed" } : style;
  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={onChange}
        style={inputSt}
        placeholder={placeholder}
        onMouseEnter={() => fieldSource && setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      />
      {showTip && fieldSource && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0,
          background: "#1f2937", color: "white", padding: "4px 8px",
          borderRadius: 6, fontSize: 11, whiteSpace: "nowrap", zIndex: 100,
          fontWeight: 500, pointerEvents: "none",
        }}>
          📄 Rempli depuis : {fieldSource.doc_name}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
      {children}
    </label>
  );
}

function InfoBlock({ number, title, description }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: "14px 16px",
        border: "1px solid #e5e7eb",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#6d28d9",
            color: "white",
            fontSize: 11,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {number}
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{title}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

const card = {
  marginTop: 18,
  background: "white",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 14,
  background: "white",
};

const primaryBtn = {
  background: "#6d28d9",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const downloadBtn = {
  border: "1.5px solid #6d28d9",
  background: "white",
  color: "#6d28d9",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const infoCard = {
  marginTop: 16,
  background: "#f8fafc",
  borderRadius: 16,
  padding: 20,
  border: "1px solid #e5e7eb",
};

const errorBox = {
  marginTop: 14,
  background: "#fee2e2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 12,
  fontWeight: 700,
};

const okBox = {
  marginTop: 14,
  background: "#dcfce7",
  color: "#166534",
  padding: 12,
  borderRadius: 12,
  fontWeight: 700,
};