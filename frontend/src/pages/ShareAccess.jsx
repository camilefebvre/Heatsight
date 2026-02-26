import { useEffect, useState } from "react";
import { UserPlus, Trash2, X, Plus, Globe } from "lucide-react";

const API_URL = "http://127.0.0.1:8000";

// ─── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_COLLABORATORS = [
  {
    id: "c1",
    projectName: "Résidence Les Acacias",
    name: "Marie Dupont",
    email: "marie.dupont@audit.be",
    role: "Auditeur principal",
  },
  {
    id: "c2",
    projectName: "Résidence Les Acacias",
    name: "Lucas Bernard",
    email: "lucas.bernard@bureau.be",
    role: "Collaborateur",
  },
  {
    id: "c3",
    projectName: "Bâtiment Administratif Nord",
    name: "Sophie Martin",
    email: "sophie.martin@energie.be",
    role: "Lecture seule",
  },
  {
    id: "c4",
    projectName: "École Primaire Saint-Jean",
    name: "Thomas Leroy",
    email: "thomas.leroy@consult.be",
    role: "Collaborateur",
  },
];

const MOCK_CLIENT_ACCESS = [
  {
    id: "ca1",
    projectName: "Résidence Les Acacias",
    email: "gestionnaire@acacias.be",
    access: { documents: true, rapport: true, requetes: false },
    status: "actif",
  },
  {
    id: "ca2",
    projectName: "Bâtiment Administratif Nord",
    email: "admin@batiment-nord.be",
    access: { documents: true, rapport: false, requetes: true },
    status: "attente",
  },
  {
    id: "ca3",
    projectName: "École Primaire Saint-Jean",
    email: "direction@saintjean.be",
    access: { documents: false, rapport: false, requetes: false },
    status: "expire",
  },
];

const ROLES = ["Auditeur principal", "Collaborateur", "Lecture seule"];

const ROLE_STYLE = {
  "Auditeur principal": { bg: "#ede9fe", color: "#6d28d9" },
  "Collaborateur":      { bg: "#dbeafe", color: "#1d4ed8" },
  "Lecture seule":      { bg: "#f3f4f6", color: "#374151" },
};

const STATUS_CONFIG = {
  actif:   { label: "Actif",       bg: "#16a34a" },
  expire:  { label: "Expiré",      bg: "#dc2626" },
  attente: { label: "En attente",  bg: "#d97706" },
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
        color: checked ? "#6d28d9" : "#6b7280",
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
        style={{ cursor: "pointer", accentColor: "#6d28d9" }}
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
  const [activeTab, setActiveTab] = useState("collaborateurs");
  const [collaborators, setCollaborators] = useState(MOCK_COLLABORATORS);
  const [clientAccess, setClientAccess] = useState(MOCK_CLIENT_ACCESS);
  const [projects, setProjects] = useState([]);

  // Modals
  const [inviteOpen, setInviteOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  // Formulaire invitation collaborateur
  const emptyInvite = { projectName: "", name: "", email: "", role: "Collaborateur" };
  const [inviteForm, setInviteForm] = useState(emptyInvite);

  // Formulaire accès client
  const emptyClient = {
    projectName: "",
    email: "",
    access: { documents: false, rapport: false, requetes: false },
  };
  const [clientForm, setClientForm] = useState(emptyClient);

  useEffect(() => {
    fetch(`${API_URL}/projects`)
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

  // ─── Handlers accès client ──────────────────────────────────────────────────
  function handleAddClient(e) {
    e.preventDefault();
    setClientAccess((prev) => [
      {
        id: `ca${nextClientId++}`,
        projectName: clientForm.projectName,
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
    background: "#6d28d9",
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── En-tête ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: "#6b7280", fontSize: 13 }}>Gestion & Administration</div>
        <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
          Partage &amp; Accès
        </h1>
        <div style={{ color: "#6b7280" }}>
          Gérez les accès des auditeurs et des clients à vos projets.
        </div>
      </div>

      {/* ── Onglets + bouton ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: "inline-flex",
            background: "white",
            borderRadius: 12,
            padding: 4,
            border: "1px solid #e9ecf3",
            gap: 2,
          }}
        >
          {[
            { key: "collaborateurs", label: "Collaborateurs" },
            { key: "clients",        label: "Accès client" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: "8px 18px",
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                fontWeight: activeTab === key ? 700 : 500,
                fontSize: 14,
                background: activeTab === key ? "#6d28d9" : "transparent",
                color: activeTab === key ? "white" : "#6b7280",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Bouton principal selon l'onglet */}
        {activeTab === "collaborateurs" ? (
          <button onClick={() => setInviteOpen(true)} style={btnPrimary}>
            <UserPlus size={15} />
            Inviter un collaborateur
          </button>
        ) : (
          <button onClick={() => setClientOpen(true)} style={btnPrimary}>
            <Globe size={15} />
            Donner accès client
          </button>
        )}
      </div>

      {/* ── Tableau ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        }}
      >
        {/* ─ Onglet Collaborateurs ─ */}
        {activeTab === "collaborateurs" && (
          collaborators.length === 0 ? (
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
                {collaborators.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#374151", fontSize: 13 }}>
                      {c.projectName}
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
                      <button
                        onClick={() => handleDeleteCollab(c.id)}
                        title="Révoquer l'accès"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 12px",
                          borderRadius: 10,
                          border: "1px solid #fecaca",
                          background: "#fff1f1",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#dc2626",
                        }}
                      >
                        <Trash2 size={13} />
                        Révoquer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* ─ Onglet Accès client ─ */}
        {activeTab === "clients" && (
          clientAccess.length === 0 ? (
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
                {clientAccess.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#374151", fontSize: 13 }}>
                      {c.projectName}
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
                      <button
                        onClick={() => handleDeleteClient(c.id)}
                        title="Révoquer l'accès"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 12px",
                          borderRadius: 10,
                          border: "1px solid #fecaca",
                          background: "#fff1f1",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#dc2626",
                        }}
                      >
                        <Trash2 size={13} />
                        Révoquer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ── Modal : Inviter un collaborateur ──────────────────────────────────── */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Inviter un collaborateur">
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Projet */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Projet</span>
            {projects.length > 0 ? (
              <select
                value={inviteForm.projectName}
                onChange={(e) => setInviteForm((p) => ({ ...p, projectName: e.target.value }))}
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
                onChange={(e) => setClientForm((p) => ({ ...p, projectName: e.target.value }))}
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
                    style={{ accentColor: "#6d28d9", cursor: "pointer" }}
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
    </div>
  );
}
