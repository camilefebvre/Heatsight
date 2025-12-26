import { Outlet } from "react-router-dom";
import Sidebar from "../ui/Sidebar";

export default function AppLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f6f7fb" }}>
      <Sidebar />

      <main style={{ flex: 1, padding: 24 }}>
        {/* IMPORTANT: pas de maxWidth, pas de margin auto */}
        <div style={{ width: "100%" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
