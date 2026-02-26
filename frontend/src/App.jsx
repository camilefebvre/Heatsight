import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import RequireAuth from "./ui/RequireAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Agenda from "./pages/Agenda";
import ProjectAudit from "./pages/ProjectAudit";
import ProjectEnergy from "./pages/ProjectEnergy";
import ProjectReport from "./pages/ProjectReport";
import ClientRequests from "./pages/ClientRequests";


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/client-requests" element={<ClientRequests />} />
          {/* routes "dans un projet" */}
          <Route path="/projects/:projectId/audit" element={<ProjectAudit />} />
          <Route path="/projects/:projectId/energy" element={<ProjectEnergy />} />
          <Route path="/projects/:projectId/report" element={<ProjectReport />} />
        </Route>
      </Route>
    </Routes>
  );
}
