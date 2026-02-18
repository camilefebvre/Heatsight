import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useProject } from "../state/ProjectContext";

const API_URL = "http://127.0.0.1:8000";

const linkStyle = ({ isActive }) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  color: isActive ? "white" : "#d4d6dd",
  background: isActive ? "#6d28d9" : "transparent",
  fontWeight: isActive ? 800 : 600,
});

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
        width: 260,
        background: "#0f1020",
        color: "white",
        padding: 18,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 22 }}>
        HeatSight
      </div>

      <div style={{ color: "#8a8ea3", fontSize: 12, margin: "14px 0 8px" }}>
        CORE
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <NavLink to="/dashboard" style={linkStyle}>
          📈 Dashboard
        </NavLink>

        <NavLink to="/projects" style={linkStyle}>
          🗂️ Projects
        </NavLink>

        <NavLink to="/agenda" style={linkStyle}>
          🗓️ Agenda
        </NavLink>
      </nav>

      {selectedProjectId ? (
        <>
          <div style={{ color: "#8a8ea3", fontSize: 12, margin: "22px 0 8px" }}>
            PROJECT{projectName ? ` — ${projectName}` : ""}
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <NavLink to={`/projects/${selectedProjectId}/audit`} style={linkStyle}>
              📝 Audit
            </NavLink>
          </nav>
        </>
      ) : (
        <div
          style={{
            marginTop: 22,
            fontSize: 12,
            color: "#8a8ea3",
            opacity: 0.9,
          }}
        >
          Double-click a project to open its Audit module.
        </div>
      )}
    </aside>
  );
}





