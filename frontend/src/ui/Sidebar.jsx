import { NavLink } from "react-router-dom";
import { useProject } from "../state/ProjectContext";

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

      {/* ✅ PROJECT modules (based on selectedProjectId, not URL) */}
      {selectedProjectId && (
        <>
          <div style={{ color: "#8a8ea3", fontSize: 12, margin: "22px 0 8px" }}>
            PROJECT
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <NavLink to={`/projects/${selectedProjectId}/audit`} style={linkStyle}>
              📝 Audit
            </NavLink>
          </nav>
        </>
      )}

      {!selectedProjectId && (
        <div style={{ marginTop: 22, fontSize: 12, color: "#8a8ea3", opacity: 0.9 }}>
          Double-click a project to open its Audit module.
        </div>
      )}
    </aside>
  );
}
