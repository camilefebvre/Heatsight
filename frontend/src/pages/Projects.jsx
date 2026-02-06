import { useEffect, useMemo, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { useNavigate } from "react-router-dom";


const API_URL = "http://127.0.0.1:8000";


import StatusPill from "../ui/StatusPill";

function nextStatus(current) {
  if (current === "draft") return "in_progress";
  if (current === "in_progress") return "completed";
  return "draft";
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          background: "white",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function Menu({ open, onClose, items }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: "100%",
        marginTop: 8,
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
        overflow: "hidden",
        minWidth: 180,
        zIndex: 2000,
      }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            border: "none",
            background: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
];

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMenuId, setStatusMenuId] = useState(null);
  const { setSelectedProjectId, selectedProjectId } = useProject();
  const navigate = useNavigate();





  // Create modal
  const [createOpen, setCreateOpen] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Per-row menu open id
  const [menuId, setMenuId] = useState(null);

  const emptyForm = {
    project_name: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    building_address: "",
    building_type: "residential",
    audit_type: "AMUREBA",
    status: "draft",
  };

  const [form, setForm] = useState(emptyForm);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function fetchProjects() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_URL}/projects`);
      if (!res.ok) throw new Error(`GET /projects failed (${res.status})`);
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Error while loading projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const recent = useMemo(() => {
    return [...projects].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [projects]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      setError("");
      const res = await fetch(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `POST /projects failed (${res.status})`);
      }
      setCreateOpen(false);
      setForm(emptyForm);
      fetchProjects();
    } catch (e) {
      setError(e.message || "Error while creating project");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this project?")) return;

    try {
      const res = await fetch(`${API_URL}/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `DELETE failed (${res.status})`);
      }
      fetchProjects();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  }

  // ✅ inline status change (PATCH)
  async function handleStatusChange(id, newStatus) {
    try {
      const res = await fetch(`${API_URL}/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `PATCH failed (${res.status})`);
      }
      fetchProjects();
    } catch (e) {
      alert(e.message || "Status update failed");
    }
  }

  // ✅ open edit modal (prefill form)
  function openEdit(project) {
    setEditing(project);
    setForm({
      project_name: project.project_name || "",
      client_name: project.client_name || "",
      client_email: project.client_email || "",
      client_phone: project.client_phone || "",
      building_address: project.building_address || "",
      building_type: project.building_type || "residential",
      audit_type: project.audit_type || "AMUREBA",
      status: project.status || "draft",
    });
    setEditOpen(true);
  }

  // ✅ submit edit (PATCH multiple fields)
  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editing?.id) return;

    try {
      const res = await fetch(`${API_URL}/projects/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `PATCH failed (${res.status})`);
      }
      setEditOpen(false);
      setEditing(null);
      setForm(emptyForm);
      fetchProjects();
    } catch (e) {
      alert(e.message || "Edit failed");
    }
  }

  return (
    <div onClick={() => setMenuId(null)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ color: "#6b7280" }}>Core</div>
          <h1 style={{ fontSize: 40, margin: "10px 0 6px" }}>Projects</h1>
          <div style={{ color: "#6b7280" }}>
            Create, edit and track audit projects.
          </div>
        </div>

        <button
          onClick={() => {
            setForm(emptyForm);
            setCreateOpen(true);
          }}
          style={{
            background: "#6d28d9",
            color: "white",
            border: "none",
            padding: "12px 16px",
            borderRadius: 12,
            fontWeight: 900,
            cursor: "pointer",
            height: 44,
          }}
        >
          + New Project
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            background: "#fee2e2",
            color: "#991b1b",
            padding: 12,
            borderRadius: 12,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          background: "white",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        }}
      >
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading projects…</div>
        ) : recent.length === 0 ? (
          <div style={{ color: "#6b7280" }}>
            No projects yet. Click <b>New Project</b> to create one.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 13 }}>
                <th style={{ padding: "10px 8px" }}>Project</th>
                <th style={{ padding: "10px 8px" }}>Client</th>
                <th style={{ padding: "10px 8px" }}>Building</th>
                <th style={{ padding: "10px 8px" }}>Audit</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr
                  key={p.id}
                  onDoubleClick={() => {
                    setSelectedProjectId(p.id);
                    navigate(`/projects/${p.id}/audit`);
                  }}
                  style={{
                  borderTop: "1px solid #eef2f7",
                  cursor: "pointer",
                  background: selectedProjectId === p.id ? "#f5f3ff" : "transparent",
                }}
                >
                  <td style={{ padding: "12px 8px", fontWeight: 900 }}>
                    {p.project_name}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <div>{p.client_name}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {p.client_email}
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <div style={{ textTransform: "capitalize" }}>
                      {p.building_type}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {p.building_address}
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>{p.audit_type}</td>

                  {/* ✅ inline status edit */}
                  <td style={{ padding: "12px 8px", position: "relative" }}>
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            setStatusMenuId((prev) => (prev === p.id ? null : p.id));
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        style={{ display: "inline-block", cursor: "pointer" }}
                    >
                        <StatusPill status={p.status || "draft"} />
                    </div>

                    <Menu
                        open={statusMenuId === p.id}
                        onClose={() => setStatusMenuId(null)}
                        items={STATUS_OPTIONS.map((s) => ({
                            label: s.label,
                            onClick: () => handleStatusChange(p.id, s.value),
                        }))}
                    />
                </td>



                  {/* ✅ three-dots menu */}
                  <td style={{ padding: "12px 8px", position: "relative" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId((prev) => (prev === p.id ? null : p.id));
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}

                      style={{
                        border: "1px solid #e5e7eb",
                        background: "white",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                      title="Actions"
                    >
                      ⋯
                    </button>

                    <Menu
                      open={menuId === p.id}
                      onClose={() => setMenuId(null)}
                      items={[
                        { label: "✏️ Edit", onClick: () => openEdit(p) },
                        { label: "🗑️ Delete", onClick: () => handleDelete(p.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>



      {/* CREATE MODAL */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a new project">
        <ProjectForm
          form={form}
          updateField={updateField}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          submitLabel="Create"
        />
      </Modal>

      {/* EDIT MODAL */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit project">
        <ProjectForm
          form={form}
          updateField={updateField}
          onCancel={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
          submitLabel="Save changes"
        />
      </Modal>
    </div>
  );
}

function ProjectForm({ form, updateField, onCancel, onSubmit, submitLabel }) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 6,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Project name</span>
        <input value={form.project_name} onChange={(e) => updateField("project_name", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Building type</span>
        <select value={form.building_type} onChange={(e) => updateField("building_type", e.target.value)}>
          <option value="residential">Residential</option>
          <option value="tertiary">Tertiary</option>
          <option value="industrial">Industrial</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Client name</span>
        <input value={form.client_name} onChange={(e) => updateField("client_name", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Client email</span>
        <input type="email" value={form.client_email} onChange={(e) => updateField("client_email", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Client phone (optional)</span>
        <input value={form.client_phone || ""} onChange={(e) => updateField("client_phone", e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Audit type</span>
        <select value={form.audit_type} onChange={(e) => updateField("audit_type", e.target.value)}>
          <option value="AMUREBA">AM/UREBA</option>
          <option value="PEB">PEB</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      <label style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Building address</span>
        <input value={form.building_address} onChange={(e) => updateField("building_address", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Status</span>
        <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: "#6d28d9",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {submitLabel}
        </button>
      </div>

      <style>{`
        input, select {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          outline: none;
          font-size: 14px;
        }
        input:focus, select:focus {
          border-color: #6d28d9;
          box-shadow: 0 0 0 3px rgba(109,40,217,0.15);
        }
      `}</style>
    </form>
  );
}
