import { Outlet } from "react-router-dom";
import Sidebar from "../ui/Sidebar";

export default function AppLayout() {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f6f7fb" }}>
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
