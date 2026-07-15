import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { useAuth } from "../state/AuthContext";
import ProfileModal from "./ProfileModal";
import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  ClipboardList,
  Zap,
  FileText,
  MessageSquare,
  Users2,
  Files,
  TrendingUp,
  Library,
  Sprout,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Database,
  BarChart3,
  FileStack,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function SidebarLink({ to, icon: Icon, label, collapsed }) {
  return (
    <NavLink
      to={to}
      className="hs-clickable"
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        gap: collapsed ? 0 : 10,
        padding: collapsed ? "9px 0" : "9px 12px",
        borderRadius: 10,
        textDecoration: "none",
        color: isActive ? "white" : "#9ca3b8",
        background: isActive ? "#59169c" : "transparent",
        fontWeight: isActive ? 700 : 500,
        fontSize: 14,
        whiteSpace: "nowrap",
        transition: "background 0.15s, color 0.15s",
      })}
    >
      <Icon size={16} strokeWidth={2} />
      {!collapsed && label}
    </NavLink>
  );
}

function SidebarGroup({ label, icon: Icon, collapsed, active, children }) {
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  // En mode replié : pas de groupe, on affiche directement les liens (icônes).
  if (collapsed) return <>{children}</>;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="hs-clickable"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          borderRadius: 10,
          border: "none",
          background: "transparent",
          color: active ? "white" : "#9ca3b8",
          fontWeight: active ? 700 : 500,
          fontSize: 14,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Icon size={16} strokeWidth={2} />
        <span style={{ flex: 1 }}>{label}</span>
        <ChevronDown
          size={15}
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}
        />
      </button>
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginLeft: 15,
            marginTop: 2,
            paddingLeft: 8,
            borderLeft: "1px solid #1e2235",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ label, collapsed }) {
  if (collapsed) return <div style={{ height: 16 }} />;
  return (
    <div
      style={{
        color: "#4b5063",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        margin: "20px 0 6px 4px",
      }}
    >
      {label}
    </div>
  );
}

function UserSection({ collapsed }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  function toggleMenu() {
    const next = !open;
    if (next && collapsed && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
    }
    setOpen(next);
  }

  useEffect(() => {
    function handleOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
    <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    <div ref={ref} style={{ position: "relative" }}>
      {/* Dropdown - s'ouvre vers le haut */}
      {open && (
        <div
          style={{
            ...(collapsed
              ? { position: "fixed", left: pos?.left ?? 72, bottom: pos?.bottom ?? 20, width: 210 }
              : { position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0 }),
            background: "#1a1d2e",
            border: "1px solid #2a2d45",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: collapsed ? "0 8px 24px rgba(0,0,0,0.4)" : "0 -8px 24px rgba(0,0,0,0.4)",
            zIndex: 200,
          }}
        >
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #2a2d45" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{user.name}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>{user.email}</div>
            {user.company_name && (
              <div style={{ fontSize: 12, color: "#9aa0b4", marginTop: 3, fontWeight: 600 }}>
                {user.company_name}
              </div>
            )}
          </div>
          <div style={{ padding: "6px" }}>
            <button
              onClick={() => {
                navigate("/abonnement");
                setOpen(false);
              }}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#e5e7eb",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
            >
              Mon abonnement
            </button>
            <button
              onClick={() => {
                setProfileOpen(true);
                setOpen(false);
              }}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#e5e7eb",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
            >
              Mon profil
            </button>
            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#e16b80",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.12s",
              }}
            >
              Se déconnecter
            </button>
          </div>
        </div>
      )}

      {/* Bouton utilisateur */}
      <button
        onClick={toggleMenu}
        title={collapsed ? user.name : undefined}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: collapsed ? 0 : 10,
          padding: collapsed ? "10px 0" : "10px 8px",
          borderRadius: 10,
          border: "none",
          background: open ? "#1e2235" : "transparent",
          cursor: "pointer",
          transition: "background 0.15s",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#59169c",
            color: "white",
            fontWeight: 700,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            letterSpacing: "0.04em",
            overflow: "hidden",
          }}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initials
          )}
        </div>
        {!collapsed && (
          <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "white",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.name}
            </div>
          </div>
        )}
      </button>
    </div>
    </>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { selectedProjectId, setSelectedProjectId } = useProject();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [projects, setProjects] = useState([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  useEffect(() => {
    async function loadName() {
      if (!selectedProjectId || !user?.token) {
        setProjectName("");
        setClientName("");
        setProjects([]);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/projects`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const list = await res.json();
        setProjects(Array.isArray(list) ? list : []);
        const p = (Array.isArray(list) ? list : []).find((x) => x.id === selectedProjectId);
        setProjectName(p?.project_name || "");
        setClientName(p?.client_name || "");
      } catch {
        setProjectName("");
        setClientName("");
        setProjects([]);
      }
    }
    loadName();
  }, [selectedProjectId, user?.token]);

  // Fermeture du sélecteur de projet au clic extérieur.
  useEffect(() => {
    function handleOutsideClick(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    }
    if (switcherOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [switcherOpen]);

  // Change de projet en restant sur le même module (sous-page) qu'actuellement.
  function switchProject(id) {
    setSwitcherOpen(false);
    if (id === selectedProjectId) return;
    const match = location.pathname.match(/^\/projects\/[^/]+\/([^/]+)/);
    const module = match ? match[1] : "audit";
    setSelectedProjectId(id);
    navigate(`/projects/${id}/${module}`);
  }

  // Groupe projet actif d'après l'URL (pour ouvrir automatiquement le bon groupe).
  const path = location.pathname;
  const isDataGroup = path.includes("/documents") || path.includes("/energy");
  const isAnalysisGroup = path.includes("/audit") || path.includes("/lca");
  const isReportGroup = path.includes("/report");

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: "#0f1020",
        color: "white",
        padding: collapsed ? "20px 8px" : "20px 14px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: "width 180ms ease",
      }}
    >
      {/* Logo + bouton bascule */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
            <img
              src="/logo.png"
              alt="Heat Sight logo"
              style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6 }}
            />
            {!collapsed && (
              <span style={{ fontWeight: 900, fontSize: 18, color: "white", letterSpacing: "-0.5px" }}>
                Heat Sight
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={onToggle}
              title="Replier le menu"
              aria-label="Replier le menu"
              className="hs-clickable"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                color: "#9ca3b8",
                cursor: "pointer",
                padding: 6,
                borderRadius: 8,
              }}
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={onToggle}
            title="Déplier le menu"
            aria-label="Déplier le menu"
            className="hs-clickable"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              marginTop: 10,
              background: "transparent",
              border: "none",
              color: "#9ca3b8",
              cursor: "pointer",
              padding: 6,
              borderRadius: 8,
            }}
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {/* Gestion & Administration */}
      <SectionLabel label="Gestion & Administration" collapsed={collapsed} />
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SidebarLink to="/dashboard" icon={LayoutDashboard} label="Tableau de bord" collapsed={collapsed} />
        <SidebarLink to="/projects" icon={FolderOpen} label="Projets" collapsed={collapsed} />
        <SidebarLink to="/agenda" icon={CalendarDays} label="Agenda" collapsed={collapsed} />
      </nav>

      {/* Bibliothèque */}
      <SectionLabel label="Bibliothèque" collapsed={collapsed} />
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SidebarLink to="/lca/library" icon={Library} label="Bibliothèque ACV" collapsed={collapsed} />
      </nav>

      {/* Collecte de données - global */}
      <SectionLabel label="Collecte de données" collapsed={collapsed} />
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SidebarLink to="/client-requests" icon={MessageSquare} label="Requête client" collapsed={collapsed} />
      </nav>

      {/* Section projet - affichée seulement si un projet est ouvert */}
      {selectedProjectId && (
        <>
          {!collapsed ? (
            <div
              ref={switcherRef}
              style={{
                position: "relative",
                margin: "20px 0 8px",
                borderTop: "1px solid #1e2235",
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  color: "#4b5063",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginLeft: 4,
                  marginBottom: 8,
                }}
              >
                Projet
              </div>

              {/* Sélecteur de projet */}
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                className="hs-clickable"
                title="Changer de projet"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #2a2d45",
                  background: switcherOpen ? "#1e2235" : "#161933",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: "#a78bfa",
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={clientName}
                  >
                    {clientName || "Client"}
                  </div>
                  <div
                    style={{
                      color: "#9ca3b8",
                      fontSize: 12,
                      fontWeight: 500,
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={projectName}
                  >
                    {projectName || "Audit"}
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  color="#9ca3b8"
                  style={{
                    flexShrink: 0,
                    transform: switcherOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                  }}
                />
              </button>

              {/* Liste déroulante des projets */}
              {switcherOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    maxHeight: 280,
                    overflowY: "auto",
                    background: "#1a1d2e",
                    border: "1px solid #2a2d45",
                    borderRadius: 10,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                    zIndex: 300,
                    padding: 4,
                  }}
                >
                  {projects.length === 0 && (
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280" }}>
                      Aucun projet
                    </div>
                  )}
                  {projects.map((p) => {
                    const current = p.id === selectedProjectId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => switchProject(p.id)}
                        className="hs-clickable"
                        style={{
                          width: "100%",
                          display: "block",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "none",
                          background: current ? "#59169c" : "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            color: current ? "white" : "#e5e7eb",
                            fontSize: 13,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={p.client_name}
                        >
                          {p.client_name || "Client"}
                        </div>
                        <div
                          style={{
                            color: current ? "#e9d5ff" : "#9ca3b8",
                            fontSize: 12,
                            marginTop: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={p.project_name}
                        >
                          {p.project_name || "Audit"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ margin: "16px 0", borderTop: "1px solid #1e2235" }} />
          )}
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <SidebarLink to="/share-access" icon={Users2} label="Partage & Accès" collapsed={collapsed} />

            <SidebarGroup label="Données & Documents" icon={Database} collapsed={collapsed} active={isDataGroup}>
              <SidebarLink to={`/projects/${selectedProjectId}/documents`} icon={Files} label="Documents" collapsed={collapsed} />
              <SidebarLink to={`/projects/${selectedProjectId}/energy`} icon={Zap} label="Comptabilité énergie" collapsed={collapsed} />
            </SidebarGroup>

            <SidebarGroup label="Analyses" icon={BarChart3} collapsed={collapsed} active={isAnalysisGroup}>
              <SidebarLink to={`/projects/${selectedProjectId}/audit`} icon={ClipboardList} label="Audit" collapsed={collapsed} />
              <SidebarLink to={`/projects/${selectedProjectId}/lca-v2`} icon={Sprout} label="ACV" collapsed={collapsed} />
            </SidebarGroup>

            <SidebarGroup label="Rapports & Livrables" icon={FileStack} collapsed={collapsed} active={isReportGroup}>
              <SidebarLink to={`/projects/${selectedProjectId}/report`} icon={FileText} label="Rapport" collapsed={collapsed} />
            </SidebarGroup>
          </nav>
        </>
      )}

      {/* Spacer - pousse l'avatar vers le bas */}
      <div style={{ flex: 1 }} />

      {/* Avatar utilisateur - épinglé en bas */}
      <div style={{ borderTop: "1px solid #1e2235", paddingTop: 12, paddingBottom: 16 }}>
        <UserSection collapsed={collapsed} />
      </div>
    </aside>
  );
}
