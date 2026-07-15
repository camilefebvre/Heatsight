import { useEffect, useMemo, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Trash2, Archive, ArchiveRestore, Plus, X } from "lucide-react";
import { apiFetch } from "../api";
import StatusPill from "../ui/StatusPill";

const BUILDING_TYPE_LABELS = {
  residential: "Résidentiel",
  tertiary: "Tertiaire",
  industrial: "Industriel",
  other: "Autre",
};
function buildingTypeLabel(value) {
  return BUILDING_TYPE_LABELS[value] || value || "";
}

function fmtDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "-";
  }
}

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
            padding: "10px 14px",
            border: "none",
            background: "white",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#374151",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
        >
          {it.icon && <it.icon size={14} strokeWidth={2} />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "draft",       label: "Brouillon"  },
  { value: "in_progress", label: "En cours"   },
  { value: "on_hold",     label: "En attente" },
  { value: "completed",   label: "Terminé"    },
];

const AUDIT_TYPE_LABELS = { AMUREBA: "AM/UREBA", PEB: "PEB", custom: "Personnalisé" };

function SortableTh({ label, field, sortBy, sortDir, onSort }) {
  const active = sortBy === field;
  return (
    <th
      className="hs-clickable"
      onClick={() => onSort(field)}
      style={{ padding: "10px 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      {label}
      <span style={{ marginLeft: 6, fontSize: 11, color: active ? "#59169c" : "#d1d5db" }}>
        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMenuId, setStatusMenuId] = useState(null);
  const { setSelectedProjectId, selectedProjectId } = useProject();
  const navigate = useNavigate();

  // Tri + filtres (P10) - liste chargée en entier, tri/filtre côté client
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  // Pré-filtre depuis l'URL (?statut=in_progress) — ex. clic sur une carte du tableau de bord
  const [statusFilter, setStatusFilter] = useState(searchParams.get("statut") || "");
  const [viewMode, setViewMode] = useState("active");   // "active" | "archived"
  const [auditFilter, setAuditFilter] = useState("");      // "" = tous
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");





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
    client_emails: [],
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
      const res = await apiFetch(`/projects${viewMode === "archived" ? "?archived=true" : ""}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  function toggleSort(field) {
    if (sortBy === field) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortBy(field);
    setSortDir(field === "created_at" || field === "updated_at" ? "desc" : "asc");
  }

  const auditTypeOptions = useMemo(
    () => [...new Set(projects.map((p) => p.audit_type).filter(Boolean))],
    [projects]
  );

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statusOrder = Object.fromEntries(STATUS_OPTIONS.map((s, i) => [s.value, i]));
    const filtered = projects.filter((p) => {
      if (statusFilter && (p.status || "draft") !== statusFilter) return false;
      if (auditFilter && p.audit_type !== auditFilter) return false;
      if (q && !`${p.project_name || ""} ${p.client_name || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p) => {
      switch (sortBy) {
        case "project_name":  return (p.project_name || "").toLowerCase();
        case "client_name":   return (p.client_name || "").toLowerCase();
        case "building_type": return buildingTypeLabel(p.building_type).toLowerCase();
        case "audit_type":    return (p.audit_type || "").toLowerCase();
        case "status":        return statusOrder[p.status || "draft"] ?? 99;
        case "updated_at":    return new Date(p.updated_at || p.created_at || 0).getTime();
        case "created_at":
        default:              return new Date(p.created_at || 0).getTime();
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [projects, search, statusFilter, auditFilter, sortBy, sortDir]);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      setError("");
      const res = await apiFetch(`/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeForm(form)),
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

  // Nettoie les emails additionnels vides avant envoi (EmailStr refuse les chaînes vides).
  function serializeForm(f) {
    return {
      ...f,
      client_emails: (f.client_emails || []).map((s) => (s || "").trim()).filter(Boolean),
    };
  }

  async function handleArchive(id, archived) {
    try {
      const res = await apiFetch(`/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `PATCH failed (${res.status})`);
      }
      setMenuId(null);
      fetchProjects();
    } catch (e) {
      alert(e.message || "Archive failed");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce projet ? Cette action est irreversible.")) return;

    try {
      const res = await apiFetch(`/projects/${id}`, { method: "DELETE" });
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
      const res = await apiFetch(`/projects/${id}`, {
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
      client_emails: project.client_emails || [],
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
      const res = await apiFetch(`/projects/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeForm(form)),
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
          <div style={{ color: "#6b7280", fontSize: 13 }}>Gestion &amp; Administration</div>
          <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
            {viewMode === "archived" ? "Projets archivés" : "Projets"}
          </h1>
          <div style={{ color: "#6b7280" }}>
            {viewMode === "archived"
              ? "Projets mis de côté — vous pouvez les désarchiver à tout moment."
              : "Créez, modifiez et suivez vos projets d'audit."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setViewMode((v) => (v === "archived" ? "active" : "archived"))}
            style={{
              background: "white",
              color: "#374151",
              border: "1px solid #e5e7eb",
              padding: "12px 16px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            {viewMode === "archived" ? (
              <>← Projets actifs</>
            ) : (
              <>
                <Archive size={16} /> Archives
              </>
            )}
          </button>

          {viewMode === "active" && (
            <button
              onClick={() => {
                setForm(emptyForm);
                setCreateOpen(true);
              }}
              style={{
                background: "#59169c",
                color: "white",
                border: "none",
                padding: "12px 18px",
                borderRadius: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              + Nouveau projet
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            background: "#fee2e2",
            color: "#8f1d2f",
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
        {!loading && projects.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un projet ou un client…"
              style={{ flex: "1 1 240px", minWidth: 0, padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none" }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, background: "white", cursor: "pointer" }}>
              <option value="">Tous les statuts</option>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}
              style={{ padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, background: "white", cursor: "pointer" }}>
              <option value="">Tous les types</option>
              {auditTypeOptions.map((t) => <option key={t} value={t}>{AUDIT_TYPE_LABELS[t] || t}</option>)}
            </select>
            {(search || statusFilter || auditFilter) && (
              <button type="button" onClick={() => { setSearch(""); setStatusFilter(""); setAuditFilter(""); }}
                style={{ padding: "9px 14px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", borderRadius: 10, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ color: "#6b7280" }}>Chargement…</div>
        ) : displayed.length === 0 ? (
          <div style={{ color: "#6b7280", padding: "8px 0" }}>
            {projects.length === 0
              ? <>Aucun projet. Cliquez sur <b>Nouveau projet</b> pour commencer.</>
              : "Aucun projet ne correspond aux filtres."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12, background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                <SortableTh label="Projet"       field="project_name"  sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Client"       field="client_name"   sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Bâtiment"     field="building_type" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Type d'audit" field="audit_type"    sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Statut"       field="status"        sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Créé le"      field="created_at"    sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh label="Modifié le"   field="updated_at"    sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <th style={{ padding: "10px 12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((p) => (
                <tr
                  key={p.id}
                  className="hs-clickable"
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
                      {buildingTypeLabel(p.building_type)}
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

                  <td style={{ padding: "12px 8px", color: "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>{fmtDate(p.created_at)}</td>
                  <td style={{ padding: "12px 8px", color: "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>{fmtDate(p.updated_at || p.created_at)}</td>

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
                        { label: "Modifier", icon: Pencil, onClick: () => openEdit(p) },
                        viewMode === "archived"
                          ? { label: "Désarchiver", icon: ArchiveRestore, onClick: () => handleArchive(p.id, false) }
                          : { label: "Archiver", icon: Archive, onClick: () => handleArchive(p.id, true) },
                        { label: "Supprimer", icon: Trash2, onClick: () => handleDelete(p.id) },
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
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau projet">
        <ProjectForm
          form={form}
          updateField={updateField}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreate}
          submitLabel="Creer"
        />
      </Modal>

      {/* EDIT MODAL */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier le projet">
        <ProjectForm
          form={form}
          updateField={updateField}
          onCancel={() => setEditOpen(false)}
          onSubmit={handleEditSubmit}
          submitLabel="Enregistrer"
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
        <span style={{ fontSize: 13, color: "#6b7280" }}>Nom du projet</span>
        <input value={form.project_name} onChange={(e) => updateField("project_name", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Type de batiment</span>
        <select value={form.building_type} onChange={(e) => updateField("building_type", e.target.value)}>
          <option value="residential">Résidentiel</option>
          <option value="tertiary">Tertiaire</option>
          <option value="industrial">Industriel</option>
          <option value="other">Autre</option>
        </select>
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Nom du client</span>
        <input value={form.client_name} onChange={(e) => updateField("client_name", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Email principal du client</span>
        <input type="email" value={form.client_email} onChange={(e) => updateField("client_email", e.target.value)} required />
      </label>

      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Autres emails (optionnel)</span>
        {(form.client_emails || []).map((em, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <input
              type="email"
              value={em}
              placeholder="email@exemple.com"
              onChange={(e) => {
                const next = [...(form.client_emails || [])];
                next[i] = e.target.value;
                updateField("client_emails", next);
              }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              title="Retirer"
              onClick={() =>
                updateField("client_emails", (form.client_emails || []).filter((_, j) => j !== i))
              }
              style={{
                border: "1px solid #e5e7eb",
                background: "white",
                borderRadius: 8,
                padding: "0 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => updateField("client_emails", [...(form.client_emails || []), ""])}
          style={{
            justifySelf: "start",
            border: "1px dashed #c4b5fd",
            background: "#f5f3ff",
            color: "#59169c",
            borderRadius: 8,
            padding: "7px 12px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Plus size={14} /> Ajouter un email
        </button>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Telephone (optionnel)</span>
        <input value={form.client_phone || ""} onChange={(e) => updateField("client_phone", e.target.value)} />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Type d'audit</span>
        <select value={form.audit_type} onChange={(e) => updateField("audit_type", e.target.value)}>
          <option value="AMUREBA">AM/UREBA</option>
          <option value="PEB">PEB</option>
          <option value="custom">Personnalise</option>
        </select>
      </label>

      <label style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Adresse du batiment</span>
        <input value={form.building_address} onChange={(e) => updateField("building_address", e.target.value)} required />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>Statut</span>
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
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Annuler
        </button>
        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: "#59169c",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 14,
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
          border-color: #59169c;
          box-shadow: 0 0 0 3px rgba(89,22,156,0.15);
        }
      `}</style>
    </form>
  );
}
