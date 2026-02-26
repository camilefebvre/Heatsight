import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";
import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  ClipboardList,
  Zap,
  FileText,
} from "lucide-react";

const API_URL = "http://127.0.0.1:8000";

function SidebarLink({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 10,
        textDecoration: "none",
        color: isActive ? "white" : "#9ca3b8",
        background: isActive ? "#6d28d9" : "transparent",
        fontWeight: isActive ? 700 : 500,
        fontSize: 14,
        transition: "background 0.15s, color 0.15s",
      })}
    >
      <Icon size={16} strokeWidth={2} />
      {label}
    </NavLink>
  );
}

function SectionLabel({ label }) {
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

export default function Sidebar() {
  const { selectedProjectId } = useProject();
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    async function loadName() {
      if (!selectedProjectId) {
        setProjectName("");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/projects`);
        const list = await res.json();
        const p = list.find((x) => x.id === selectedProjectId);
        setProjectName(p?.project_name || "");
      } catch {
        setProjectName("");
      }
    }
    loadName();
  }, [selectedProjectId]);

  return (
    <aside
      style={{
        width: 240,
        minHeight: "100vh",
        background: "#0f1020",
        color: "white",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <img
          src="/logo.png"
          alt="Heat Sight logo"
          style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6 }}
        />
        <span style={{ fontWeight: 900, fontSize: 18, color: "white", letterSpacing: "-0.5px" }}>
          Heat Sight
        </span>
      </div>

      {/* Gestion & Administration */}
      <SectionLabel label="Gestion & Administration" />
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <SidebarLink to="/dashboard" icon={LayoutDashboard} label="Tableau de bord" />
        <SidebarLink to="/projects" icon={FolderOpen} label="Projets" />
        <SidebarLink to="/agenda" icon={CalendarDays} label="Agenda" />
      </nav>

      {/* Section projet — affichée seulement si un projet est ouvert */}
      {selectedProjectId && (
        <>
          <div
            style={{
              margin: "20px 0 6px",
              borderTop: "1px solid #1e2235",
              paddingTop: 20,
            }}
          >
            <div style={{ color: "#4b5063", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, marginLeft: 4 }}>
              Collecte de données
            </div>
            {projectName && (
              <div style={{ color: "#6d28d9", fontSize: 12, fontWeight: 600, marginLeft: 4, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {projectName}
              </div>
            )}
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <SidebarLink to={`/projects/${selectedProjectId}/audit`} icon={ClipboardList} label="Audit" />
          </nav>

          <SectionLabel label="Support & Automatisation" />
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <SidebarLink to={`/projects/${selectedProjectId}/energy`} icon={Zap} label="Comptabilité énergie" />
            <SidebarLink to={`/projects/${selectedProjectId}/report`} icon={FileText} label="Rapport" />
          </nav>
        </>
      )}

      {!selectedProjectId && (
        <div
          style={{
            marginTop: "auto",
            paddingTop: 24,
            fontSize: 12,
            color: "#4b5063",
            lineHeight: 1.5,
          }}
        >
          Double-clique sur un projet pour ouvrir son module Audit.
        </div>
      )}
    </aside>
  );
}
