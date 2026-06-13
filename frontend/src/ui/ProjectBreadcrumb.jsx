import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { apiFetch } from "../api";

const MODULE_LABELS = [
  { match: "/documents", label: "Documents" },
  { match: "/audit",     label: "Audit" },
  { match: "/energy",    label: "Comptabilité énergie" },
  { match: "/report",    label: "Rapport" },
  { match: "/lca-v2",    label: "ACV" },   // avant /lca (sinon /lca matcherait /lca-v2)
  { match: "/lca",       label: "ACV" },
];
function moduleLabel(pathname) {
  return (MODULE_LABELS.find((m) => pathname.includes(m.match)) || {}).label || "";
}

export default function ProjectBreadcrumb() {
  const { projectId } = useParams();
  const { pathname } = useLocation();
  const [project, setProject] = useState(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => { if (alive) setProject(list.find((x) => String(x.id) === String(projectId)) || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [projectId]);

  if (!project) return null; // pas de flash tant que les données ne sont pas là

  const mod = moduleLabel(pathname);
  const sep = <span style={{ color: "#d1d5db", margin: "0 8px" }}>|</span>;

  return (
    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
      <span>{project.client_name || "—"}</span>
      {sep}
      <span>{project.project_name || "—"}</span>
      {mod && (<>{sep}<span style={{ color: "#374151", fontWeight: 700 }}>{mod}</span></>)}
    </div>
  );
}
