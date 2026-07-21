import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import ProjectLayout from "./layout/ProjectLayout";
import RequireAuth from "./ui/RequireAuth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import Agenda from "./pages/Agenda";
// import ProjectAudit from "./pages/ProjectAudit"; // conservé en brouillon, non affiché
import ProjectDocuments from "./pages/ProjectDocuments";
import ProjectEnergy from "./pages/ProjectEnergy";
import ProjectReport from "./pages/ProjectReport";
import ProjectPlanAmelioration from "./pages/ProjectPlanAmelioration";


import ProjectLCA2 from "./pages/ProjectLCA2";
import AcvBuilder from "./pages/AcvBuilder";
import LCALibrary from "./pages/LCALibrary";
import ShareAccess from "./pages/ShareAccess";
import Abonnement from "./pages/Abonnement";
import Admin from "./pages/Admin";
import RequireAdmin from "./ui/RequireAdmin";


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/share-access" element={<ShareAccess />} />
          <Route path="/abonnement" element={<Abonnement />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
          {/* routes "dans un projet" - enveloppées par ProjectLayout (fil d'Ariane) */}
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<Navigate to="audit" replace />} />
            <Route path="audit" element={<ProjectPlanAmelioration />} />
            <Route path="documents" element={<ProjectDocuments />} />
            <Route path="energy" element={<ProjectEnergy />} />
            <Route path="report" element={<ProjectReport />} />
            {/* <Route path="plan-amelioration" element={<ProjectPlanAmelioration />} /> */}
            <Route path="lca-v2" element={<ProjectLCA2 />} />
            <Route path="acv-builder" element={<AcvBuilder />} />
          </Route>
          <Route path="/lca/library" element={<LCALibrary />} />
        </Route>
      </Route>
    </Routes>
  );
}
