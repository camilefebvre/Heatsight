import { useEffect, useState } from "react";
import { UserPlus, Trash2, X, Plus, Globe, Pencil } from "lucide-react";
import { apiFetch } from "../api";
import { useProject } from "../state/ProjectContext";

// ─── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_COLLABORATORS = [
  {
    id: "c1",
    projectName: "Résidence Les Acacias",
    client: "SCI Les Acacias",
    name: "Marie Dupont",
    email: "marie.dupont@audit.be",
    role: "Auditeur principal",
  },
  {
    id: "c2",
    projectName: "Résidence Les Acacias",
    client: "SCI Les Acacias",
    name: "Lucas Bernard",
    email: "lucas.bernard@bureau.be",
    role: "Collaborateur",
  },
  {
    id: "c3",
    projectName: "Bâtiment Administratif Nord",
    client: "Province de Namur",
    name: "Sophie Martin",
    email: "sophie.martin@energie.be",
    role: "Lecture seule",
  },
  {
    id: "c4",
    projectName: "École Primaire Saint-Jean",
    client: "ASBL Saint-Jean",
    name: "Thomas Leroy",
    email: "thomas.leroy@consult.be",
    role: "Collaborateur",
  },
];

const MOCK_CLIENT_ACCESS = [
  {
    id: "ca1",
    projectName: "Résidence Les Acacias",
    client: "SCI Les Acacias",
    email: "gestionnaire@acacias.be",
    access: { documents: true, rapport: true, requetes: false },
    status: "actif",
  },
  {
    id: "ca2",
    projectName: "Bâtiment Administratif Nord",
    client: "Province de Namur",
    email: "admin@batiment-nord.be",
    access: { documents: true, rapport: false, requetes: true },
    status: "attente",
  },
  {
    id: "ca3",
    projectName: "École Primaire Saint-Jean",
    client: "ASBL Saint-Jean",
    email: "direction@saintjean.be",
    access: { documents: false, rapport: false, requetes: false },
    status: "expire",
  },
];

const ROLES = ["Auditeur principal", "Collaborateur", "Lecture seule"];

const ROLE_STYLE = {
  "Propriétaire":       { bg: "#ede9fe", color: "#59169c" },
  "Auditeur principal": { bg: "#ede9fe", color: "#59169c" },
  "Collaborateur":      { bg: "#f3f4f6", color: "#374151" },
  "Lecture seule":      { bg: "#f3f4f6", color: "#374151" },
};

const STATUS_CONFIG = {
  actif:   { label: "Actif",       bg: "#59169c" },
  expire:  { label: "Expiré",      bg: "#ca2946" },
  attente: { label: "En attente",  bg: "#fe9300" },
};

let nextCollabId = 5;
let nextClientId = 4;

// ─── Composants utilitaires ────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const s = ROLE_STYLE[role] || ROLE_STYLE["Lecture seule"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        background: s.bg,
        color: s.color,
        letterSpacing: "0.02em",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.attente;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        background: s.bg,
        color: "white",
        letterSpacing: "0.02em",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function AccessCheckbox({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color: checked ? "#59169c" : "#6b7280",
        fontWeight: checked ? 600 : 400,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ cursor: "pointer", accentColor: "#59169c" }}
      />
      {label}
    </label>
  );
}

function Modal({ open, onClose, title, children, width = 560 }) {
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
          width: `min(${width}px, 100%)`,
          background: "white",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: "#111827" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function ShareAccess() {
  const { selectedProjectId } = useProject();
  const [view, setView] = useState(selectedProjectId ? "project" : "all"); // "project" | "all" | "mine"
  const [activeTab, setActiveTab] = useState("collaborateurs");
  const [collaborators, setCollaborators] = useState(MOCK_COLLABORATORS);
  const [clientAccess, setClientAccess] = useState(MOCK_CLIENT_ACCESS);
  const [projects, setProjects] = useState([]);

  // Modals
  const [inviteOpen, setInviteOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  // Édition (P13) - collaborateur (rôle) / client (statut)
  const [editCollab, setEditCollab] = useState(null); // { id, name, role } ou null
  const [editClient, setEditClient] = useState(null); // { id, email, status } ou null

  // Formulaire invitation collaborateur
  const emptyInvite = { projectName: "", client: "", name: "", email: "", role: "Collaborateur" };
  const [inviteForm, setInviteForm] = useState(emptyInvite);

  // Formulaire accès client
  const emptyClient = {
    projectName: "",
    client: "",
    email: "",
    access: { documents: false, rapport: false, requetes: false },
  };
  const [clientForm, setClientForm] = useState(emptyClient);

  // Capture project_name + client_name depuis le projet sélectionné
  function pickProject(name) {
    const proj = projects.find((p) => p.project_name === name);
    return { projectName: name, client: proj?.client_name || "" };
  }

  useEffect(() => {
    apiFetch(`/projects`)
      .then((r) => r.json())
      .then((list) => setProjects(Array.isArray(list) ? list : []))
      .catch(() => setProjects([]));
  }, []);

  // ─── Handlers collaborateurs ────────────────────────────────────────────────
  function handleInvite(e) {
    e.preventDefault();
    setCollaborators((prev) => [
      {
        id: `c${nextCollabId++}`,
        projectName: inviteForm.projectName,
        client: inviteForm.client,
        name: inviteForm.name,
        email: inviteForm.email,
        role: inviteForm.role,
      },
      ...prev,
    ]);
    setInviteOpen(false);
    setInviteForm(emptyInvite);
  }

  function handleDeleteCollab(id) {
    if (!confirm("Révoquer l'accès de ce collaborateur ?")) return;
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
  }

  function handleUpdateCollab(e) {
    e.preventDefault();
    setCollaborators((prev) =>
      prev.map((c) => (c.id === editCollab.id ? { ...c, role: editCollab.role } : c))
    );
    setEditCollab(null);
  }

  // ─── Handlers accès client ──────────────────────────────────────────────────
  function handleAddClient(e) {
    e.preventDefault();
    setClientAccess((prev) => [
      {
        id: `ca${nextClientId++}`,
        projectName: clientForm.projectName,
        client: clientForm.client,
        email: clientForm.email,
        access: { ...clientForm.access },
        status: "attente",
      },
      ...prev,
    ]);
    setClientOpen(false);
    setClientForm(emptyClient);
  }

  function handleDeleteClient(id) {
    if (!confirm("Révoquer l'accès client ?")) return;
    setClientAccess((prev) => prev.filter((c) => c.id !== id));
  }

  function handleUpdateClient(e) {
    e.preventDefault();
    setClientAccess((prev) =>
      prev.map((c) => (c.id === editClient.id ? { ...c, status: editClient.status } : c))
    );
    setEditClient(null);
  }

  function toggleClientAccess(id, key) {
    setClientAccess((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, access: { ...c.access, [key]: !c.access[key] } } : c
      )
    );
  }

  // ─── Styles communs ─────────────────────────────────────────────────────────
  const inputStyle = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  };

  const btnPrimary = {
    background: "#59169c",
    color: "white",
    border: "none",
    padding: "11px 18px",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    whiteSpace: "nowrap",
  };

  const btnSecondary = {
    background: "white",
    color: "#374151",
    border: "1px solid #e5e7eb",
    padding: "11px 16px",
    borderRadius: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  };

  const thStyle = {
    padding: "10px 12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontSize: 11,
  };

  const tdStyle = { padding: "12px 12px" };

  const editBtn = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 12px", borderRadius: 10,
    border: "1px solid #e5e7eb", background: "white",
    cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#59169c",
  };
  const revokeBtn = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 12px", borderRadius: 10,
    border: "1px solid #fecaca", background: "#fff1f1",
    cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#ca2946",
  };

  const cardStyle = {
    background: "white", borderRadius: 16, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  };
  const tabsWrap = {
    display: "inline-flex", background: "white", borderRadius: 12, padding: 4,
    border: "1px solid #e9ecf3", gap: 2,
  };
  const tabBtn = (active) => ({
    padding: "8px 18px", borderRadius: 9, border: "none", cursor: "pointer",
    fontWeight: active ? 700 : 500, fontSize: 14,
    background: active ? "#59169c" : "transparent", color: active ? "white" : "#6b7280",
    transition: "background 0.15s, color 0.15s",
  });
  const emptyRow = { color: "#6b7280", padding: "24px 0" };

  // ── Filtrage selon la vue ──
  const currentProject = projects.find((p) => p.id === selectedProjectId) || null;
  const collabsForView = view === "project"
    ? collaborators.filter((c) => c.projectName === currentProject?.project_name)
    : collaborators;
  const clientsForView = view === "project"
    ? clientAccess.filter((c) => c.projectName === currentProject?.project_name)
    : clientAccess;

  function openInvite() {
    setInviteForm(view === "project" && currentProject
      ? { ...emptyInvite, projectName: currentProject.project_name, client: currentProject.client_name || "" }
      : emptyInvite);
    setInviteOpen(true);
  }
  function openClient() {
    setClientForm(view === "project" && currentProject
      ? { ...emptyClient, projectName: currentProject.project_name, client: currentProject.client_name || "" }
      : emptyClient);
    setClientOpen(true);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Fil d'Ariane (homogène avec les autres modules projet) ── */}
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {currentProject && (
          <>
            <span>{currentProject.client_name || "-"}</span>
            <span style={{ color: "#d1d5db", margin: "0 8px" }}>|</span>
            <span>{currentProject.project_name || "-"}</span>
            <span style={{ color: "#d1d5db", margin: "0 8px" }}>|</span>
          </>
        )}
        <span style={{ color: "#374151", fontWeight: 700 }}>Partage &amp; Accès</span>
      </div>

      {/* ── Sélecteur de vue (3 vues) ── */}
      <div style={{ ...tabsWrap, marginBottom: 16 }}>
        {[
          { key: "project", label: "Ce projet" },
          { key: "all",     label: "Tous les partages" },
          { key: "mine",    label: "Mes accès" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setView(key)} style={tabBtn(view === key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Contexte projet (vue "Ce projet") */}
      {view === "project" && currentProject && (
        <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 14 }}>
          Partages du projet <b style={{ color: "#111827" }}>{currentProject.project_name}</b>
          {currentProject.client_name ? ` — ${currentProject.client_name}` : ""}
        </div>
      )}

      {/* ── Sous-onglets Collaborateurs/Client + bouton (sauf vue "Mes accès") ── */}
      {view !== "mine" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={tabsWrap}>
            {[
              { key: "collaborateurs", label: "Collaborateurs" },
              { key: "clients",        label: "Accès client" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)} style={tabBtn(activeTab === key)}>
                {label}
              </button>
            ))}
          </div>

          {!(view === "project" && !currentProject) && (
            activeTab === "collaborateurs" ? (
              <button onClick={openInvite} style={btnPrimary}>
                <UserPlus size={15} /> Inviter un collaborateur
              </button>
            ) : (
              <button onClick={openClient} style={btnPrimary}>
                <Globe size={15} /> Donner accès client
              </button>
            )
          )}
        </div>
      )}

      {/* ── Vue « Mes accès » : mes projets (accès complet) ── */}
      {view === "mine" && (
        <div style={cardStyle}>
          {projects.length === 0 ? (
            <div style={emptyRow}>Aucun projet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  {["Projet", "Client", "Mon rôle"].map((col) => <th key={col} style={thStyle}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#111827" }}>{p.project_name}</td>
                    <td style={{ ...tdStyle, color: "#6b7280", fontSize: 13 }}>{p.client_name}</td>
                    <td style={tdStyle}>
                      <RoleBadge role="Propriétaire" />
                      <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>accès complet</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Vue « Ce projet » sans projet ouvert ── */}
      {view === "project" && !currentProject && (
        <div style={cardStyle}>
          <div style={emptyRow}>Ouvrez un projet pour voir ses partages.</div>
        </div>
      )}

      {/* ── Tableaux collaborateurs / accès client (vues « Ce projet » & « Tous les partages ») ── */}
      {view !== "mine" && !(view === "project" && !currentProject) && (
      <div style={cardStyle}>
        {/* ─ Onglet Collaborateurs ─ */}
        {activeTab === "collaborateurs" && (
          collabsForView.length === 0 ? (
            <div style={{ color: "#6b7280", padding: "24px 0" }}>
              Aucun collaborateur. Cliquez sur <b>+ Inviter un collaborateur</b> pour commencer.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  {["Projet", "Nom", "Email", "Rôle", "Actions"].map((col) => (
                    <th key={col} style={thStyle}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collabsForView.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#374151", fontSize: 13 }}>
                      {c.projectName}
                      {c.client && <div style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12, marginTop: 2 }}>{c.client}</div>}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#111827" }}>
                      {c.name}
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280", fontSize: 13 }}>
                      {c.email}
                    </td>
                    <td style={tdStyle}>
                      <RoleBadge role={c.role} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setEditCollab({ id: c.id, name: c.name, role: c.role })}
                          title="Modifier le rôle"
                          style={editBtn}
                        >
                          <Pencil size={13} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteCollab(c.id)}
                          title="Révoquer l'accès"
                          style={revokeBtn}
                        >
                          <Trash2 size={13} />
                          Révoquer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* ─ Onglet Accès client ─ */}
        {activeTab === "clients" && (
          clientsForView.length === 0 ? (
            <div style={{ color: "#6b7280", padding: "24px 0" }}>
              Aucun accès client configuré. Cliquez sur <b>+ Donner accès client</b> pour commencer.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  {["Projet", "Email client", "Accès autorisé", "Statut", "Actions"].map((col) => (
                    <th key={col} style={thStyle}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientsForView.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#374151", fontSize: 13 }}>
                      {c.projectName}
                      {c.client && <div style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12, marginTop: 2 }}>{c.client}</div>}
                    </td>
                    <td style={{ ...tdStyle, color: "#111827", fontWeight: 600, fontSize: 13 }}>
                      {c.email}
                    </td>
                    <td style={{ ...tdStyle }}>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <AccessCheckbox
                          label="Documents"
                          checked={c.access.documents}
                          onChange={() => toggleClientAccess(c.id, "documents")}
                        />
                        <AccessCheckbox
                          label="Rapport"
                          checked={c.access.rapport}
                          onChange={() => toggleClientAccess(c.id, "rapport")}
                        />
                        <AccessCheckbox
                          label="Requêtes"
                          checked={c.access.requetes}
                          onChange={() => toggleClientAccess(c.id, "requetes")}
                        />
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={c.status} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => setEditClient({ id: c.id, email: c.email, status: c.status })}
                          title="Modifier le statut"
                          style={editBtn}
                        >
                          <Pencil size={13} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteClient(c.id)}
                          title="Révoquer l'accès"
                          style={revokeBtn}
                        >
                          <Trash2 size={13} />
                          Révoquer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
      )}

      {/* ── Modal : Inviter un collaborateur ──────────────────────────────────── */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Inviter un collaborateur">
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Projet */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Projet</span>
            {projects.length > 0 ? (
              <select
                value={inviteForm.projectName}
                onChange={(e) => setInviteForm((p) => ({ ...p, ...pickProject(e.target.value) }))}
                required
                style={inputStyle}
              >
                <option value="">Sélectionner un projet…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.project_name}>{p.project_name}</option>
                ))}
              </select>
            ) : (
              <input
                value={inviteForm.projectName}
                onChange={(e) => setInviteForm((p) => ({ ...p, projectName: e.target.value }))}
                placeholder="Nom du projet"
                required
                style={inputStyle}
              />
            )}
          </label>

          {/* Nom */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Nom complet</span>
            <input
              value={inviteForm.name}
              onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Prénom Nom"
              required
              style={inputStyle}
            />
          </label>

          {/* Email */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Adresse email</span>
            <input
              type="email"
              value={inviteForm.email}
              onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="collaborateur@exemple.be"
              required
              style={inputStyle}
            />
          </label>

          {/* Rôle */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Rôle</span>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
              style={inputStyle}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={() => setInviteOpen(false)} style={btnSecondary}>
              Annuler
            </button>
            <button type="submit" style={btnPrimary}>
              <UserPlus size={14} />
              Envoyer l'invitation
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal : Donner accès client ───────────────────────────────────────── */}
      <Modal open={clientOpen} onClose={() => setClientOpen(false)} title="Donner accès client">
        <form onSubmit={handleAddClient} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Projet */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Projet</span>
            {projects.length > 0 ? (
              <select
                value={clientForm.projectName}
                onChange={(e) => setClientForm((p) => ({ ...p, ...pickProject(e.target.value) }))}
                required
                style={inputStyle}
              >
                <option value="">Sélectionner un projet…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.project_name}>{p.project_name}</option>
                ))}
              </select>
            ) : (
              <input
                value={clientForm.projectName}
                onChange={(e) => setClientForm((p) => ({ ...p, projectName: e.target.value }))}
                placeholder="Nom du projet"
                required
                style={inputStyle}
              />
            )}
          </label>

          {/* Email client */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Email du client</span>
            <input
              type="email"
              value={clientForm.email}
              onChange={(e) => setClientForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="client@exemple.be"
              required
              style={inputStyle}
            />
          </label>

          {/* Modules visibles */}
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 10 }}>
              Modules visibles par le client
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { key: "documents", label: "Documents" },
                { key: "rapport",   label: "Rapport" },
                { key: "requetes",  label: "Requêtes" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: clientForm.access[key] ? "#faf5ff" : "white",
                    borderColor: clientForm.access[key] ? "#c4b5fd" : "#e5e7eb",
                    transition: "background 0.12s, border-color 0.12s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={clientForm.access[key]}
                    onChange={() =>
                      setClientForm((p) => ({
                        ...p,
                        access: { ...p.access, [key]: !p.access[key] },
                      }))
                    }
                    style={{ accentColor: "#59169c", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={() => setClientOpen(false)} style={btnSecondary}>
              Annuler
            </button>
            <button type="submit" style={btnPrimary}>
              <Globe size={14} />
              Créer l'accès
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal : Modifier le rôle (collaborateur) ──────────────────────────── */}
      <Modal open={!!editCollab} onClose={() => setEditCollab(null)} title="Modifier le rôle">
        {editCollab && (
          <form onSubmit={handleUpdateCollab} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Collaborateur : <b style={{ color: "#111827" }}>{editCollab.name}</b>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Rôle</span>
              <select
                value={editCollab.role}
                onChange={(e) => setEditCollab((p) => ({ ...p, role: e.target.value }))}
                style={inputStyle}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" onClick={() => setEditCollab(null)} style={btnSecondary}>Annuler</button>
              <button type="submit" style={btnPrimary}><Pencil size={14} />Enregistrer</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Modal : Modifier le statut (accès client) ─────────────────────────── */}
      <Modal open={!!editClient} onClose={() => setEditClient(null)} title="Modifier le statut">
        {editClient && (
          <form onSubmit={handleUpdateClient} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Client : <b style={{ color: "#111827" }}>{editClient.email}</b>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Statut</span>
              <select
                value={editClient.status}
                onChange={(e) => setEditClient((p) => ({ ...p, status: e.target.value }))}
                style={inputStyle}
              >
                {Object.entries(STATUS_CONFIG).map(([v, cfg]) => <option key={v} value={v}>{cfg.label}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" onClick={() => setEditClient(null)} style={btnSecondary}>Annuler</button>
              <button type="submit" style={btnPrimary}><Pencil size={14} />Enregistrer</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
