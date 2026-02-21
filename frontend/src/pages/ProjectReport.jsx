import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = "http://127.0.0.1:8000";

export default function ProjectReport() {
  const { projectId } = useParams();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

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
      const res = await fetch(`${API_URL}/projects`);
      if (!res.ok) throw new Error(`GET /projects failed (${res.status})`);
      const list = await res.json();
      const p = list.find((x) => x.id === projectId);
      setProject(p || null);

      // 2) Report data
      const resR = await fetch(`${API_URL}/projects/${projectId}/report`);
      if (!resR.ok) throw new Error(`GET /report failed (${resR.status})`);
      const data = await resR.json();

      // merge léger
      setReport((prev) => ({ ...prev, ...(data || {}) }));

      // petit confort: si vide, proposer une valeur par défaut
      if (p && (!data || !data.provider_company)) {
        setReport((prev) => ({ ...prev, provider_company: "HeatSight" }));
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

      const res = await fetch(`${API_URL}/projects/${projectId}/report`, {
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

  if (loading) return <div style={{ color: "#6b7280" }}>Loading…</div>;
  if (!project) return <div style={{ color: "#6b7280" }}>Project not found.</div>;

  const isPartiel = report.audit_type === "Audit Partiel";

  return (
    <div style={{ maxWidth: 1100, width: "100%" }}>
      <div style={{ color: "#6b7280" }}>Projet</div>
      <h1 style={{ fontSize: 36, margin: "6px 0 6px" }}>
        Rapport — {project.project_name}
      </h1>
      <div style={{ color: "#6b7280" }}>
        Remplis la page de garde, sauvegarde, puis télécharge le document Word.
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {okMsg && <div style={okBox}>{okMsg}</div>}

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Type d’audit">
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
            <input
              value={report.provider_company}
              onChange={(e) => updateField("provider_company", e.target.value)}
              style={inputStyle}
              placeholder="Ex: HeatSight SRL"
            />
          </Field>

          <Field label="Nom / prénom de l’auditeur(trice) responsable">
            <input
              value={report.auditor_name}
              onChange={(e) => updateField("auditor_name", e.target.value)}
              style={inputStyle}
              placeholder="Ex: Camille ..."
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" onClick={saveReport} disabled={busy} style={primaryBtn}>
            {busy ? "…" : "💾 Sauvegarder"}
          </button>

          <a
            href={`${API_URL}/projects/${projectId}/report/docx`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none" }}
          >
            <button type="button" style={secondaryBtn}>
              ⬇️ Télécharger le rapport (Word)
            </button>
          </a>
        </div>

        <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
          Astuce : clique “Sauvegarder” puis “Télécharger”.
        </div>
      </div>
    </div>
  );
}

/* UI */
function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
      {children}
    </label>
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

const secondaryBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
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