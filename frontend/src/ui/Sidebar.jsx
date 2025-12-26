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
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 18 }}>
        Heat Sight
      </div>

      <div style={{ color: "#8a8ea3", fontSize: 12, margin: "14px 0 8px" }}>
        Core
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <NavLink to="/dashboard" style={linkStyle}>
          📊 Dashboard
        </NavLink>
        <NavLink to="/documents" style={linkStyle}>
          📁 Document Management
        </NavLink>
      </nav>

      <div style={{ color: "#8a8ea3", fontSize: 12, margin: "18px 0 8px" }}>
        Support & Automation
      </div>

      <div style={{ fontSize: 13, color: "#d4d6dd", opacity: 0.8 }}>
        (à venir)
      </div>
    </aside>
  );
}
