import { NavLink } from "react-router-dom";

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
  return (
    <aside
      style={{
        width: 260,
        background: "#0f1020",
        color: "white",
        padding: 18,
      }}
    >
      {/* Logo / Title */}
      <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 22 }}>
        HeatSight
      </div>

      {/* Core section */}
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

      {/* Future modules */}
      <div style={{ color: "#8a8ea3", fontSize: 12, margin: "22px 0 8px" }}>
        AUTOMATION
      </div>

      <div style={{ fontSize: 13, color: "#d4d6dd", opacity: 0.6 }}>
        🤖 AI Assistant <br />
        📊 Reports <br />
        ♻️ ACV Analysis <br />
        💰 Financial Module
      </div>
    </aside>
  );
}
