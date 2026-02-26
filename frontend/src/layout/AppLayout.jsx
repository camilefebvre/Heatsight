import { Outlet } from "react-router-dom";
import Sidebar from "../ui/Sidebar";
import TopBar from "../ui/TopBar";

export default function AppLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f6f7fb" }}>
      <Sidebar />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar />

        <main style={{ flex: 1, padding: 24, overflow: "hidden" }}>
          {/* IMPORTANT: pas de maxWidth, pas de margin auto */}
          <div style={{ width: "100%" }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
