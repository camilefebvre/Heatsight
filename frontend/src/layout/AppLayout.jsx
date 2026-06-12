import { Outlet } from "react-router-dom";
import { useState } from "react";
import Sidebar from "../ui/Sidebar";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("hs-sidebar-collapsed") === "1"
  );

  function toggleSidebar() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("hs-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f6f7fb" }}>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />

      <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
