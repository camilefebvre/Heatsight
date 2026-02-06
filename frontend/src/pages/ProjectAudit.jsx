import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_URL = "http://127.0.0.1:8000";

export default function ProjectAudit() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [saving, setSaving] = useState(false);

  const [audit, setAudit] = useState({
    auditor_name: "",
    visit_date: "",
    notes: "",
  });

  async function load() {
    const res = await fetch(`${API_URL}/projects`);
    const list = await res.json();
    const p = list.find((x) => x.id === projectId);
    setProject(p);

    // si tu stockes audit_data dans le projet
    if (p?.audit_data) setAudit({ ...audit, ...p.audit_data });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function update(k, v) {
    setAudit((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    await fetch(`${API_URL}/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audit_data: audit }),
    });
    setSaving(false);
    load();
  }

  if (!project) return <div style={{ color: "#6b7280" }}>Loading audit…</div>;

  return (
    <div>
      <div style={{ color: "#6b7280" }}>Project</div>
      <h1 style={{ fontSize: 40, margin: "10px 0 6px" }}>
        Audit — {project.project_name}
      </h1>
      <div style={{ color: "#6b7280" }}>
        This audit data is saved per project.
      </div>

      <div style={{ marginTop: 18, background: "white", borderRadius: 16, padding: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Auditor name</span>
          <input value={audit.auditor_name} onChange={(e) => update("auditor_name", e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Visit date</span>
          <input type="date" value={audit.visit_date} onChange={(e) => update("visit_date", e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>Notes</span>
          <textarea
            rows={4}
            value={audit.notes}
            onChange={(e) => update("notes", e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: "#6d28d9",
              color: "white",
              border: "none",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 900,
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
