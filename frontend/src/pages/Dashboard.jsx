import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Play, Clock, CheckCircle, CalendarDays, MapPin, Video, Activity } from "lucide-react";
import StatusPill from "../ui/StatusPill";
import { useProject } from "../state/ProjectContext";
import { apiFetch } from "../api";

const BUILDING_TYPE_LABELS = {
  residential: "Résidentiel",
  tertiary: "Tertiaire",
  industrial: "Industriel",
  other: "Autre",
};
function buildingTypeLabel(value) {
  return BUILDING_TYPE_LABELS[value] || value || "";
}

function StatCard({ title, value, subtitle, Icon, accentColor, onClick }) {
  return (
    <div
      onClick={onClick}
      className={onClick ? "hs-clickable" : undefined}
      style={{
        background: "white",
        borderRadius: 16,
        padding: "20px 22px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: accentColor + "18",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={18} color={accentColor} strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#111827", lineHeight: 1.1, marginTop: 2 }}>
          {value}
        </div>
        <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short" }) +
    " · " +
    d.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { setSelectedProjectId } = useProject();
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        const [pRes, eRes] = await Promise.all([
          apiFetch("/projects"),
          apiFetch("/events"),
        ]);
        const pData = await pRes.json();
        const eData = await eRes.json().catch(() => []);
        setProjects(Array.isArray(pData) ? pData : []);
        setEvents(Array.isArray(eData) ? eData : []);
      } catch (e) {
        console.error(e);
        setProjects([]);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // Ouvre un projet (sélectionne + navigue vers son module Audit).
  function openProject(id) {
    setSelectedProjectId(id);
    navigate(`/projects/${id}/audit`);
  }

  const projectById = useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p;
    return m;
  }, [projects]);

  // Prochains rendez-vous : événements à venir, triés par date croissante.
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return [...events]
      .filter((e) => e.start && new Date(e.start) >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 5);
  }, [events]);

  // Dernière activité : projets triés par dernière modification.
  const recentActivity = useMemo(() => {
    return [...projects]
      .filter((p) => p.updated_at || p.created_at)
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0) -
          new Date(a.updated_at || a.created_at || 0)
      )
      .slice(0, 5);
  }, [projects]);

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === "in_progress").length;
    const onHold = projects.filter((p) => p.status === "on_hold").length;
    const completed = projects.filter((p) => p.status === "completed").length;
    const now = new Date();
    const newThisMonth = projects.filter((p) => {
      if (!p.created_at) return false;
      const d = new Date(p.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { total, active, onHold, completed, newThisMonth };
  }, [projects]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);
  }, [projects]);

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Vue d'ensemble</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 24px", color: "#111827" }}>
        Tableau de bord
      </h1>

      {/* Grille 4 colonnes - cartes statistiques */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatCard
          title="Total projets"
          value={loading ? "-" : stats.total}
          subtitle={`${loading ? "-" : stats.newThisMonth} ce mois-ci`}
          Icon={FolderOpen}
          accentColor="#6b7280"
          onClick={() => navigate("/projects")}
        />
        <StatCard
          title="Audits en cours"
          value={loading ? "-" : stats.active}
          subtitle="En progression"
          Icon={Play}
          accentColor="#59169c"
          onClick={() => navigate("/projects?statut=in_progress")}
        />
        <StatCard
          title="En attente"
          value={loading ? "-" : stats.onHold}
          subtitle="Mis en pause"
          Icon={Clock}
          accentColor="#fe9300"
          onClick={() => navigate("/projects?statut=on_hold")}
        />
        <StatCard
          title="Audits terminés"
          value={loading ? "-" : stats.completed}
          subtitle="Finalisés"
          Icon={CheckCircle}
          accentColor="#82137e"
          onClick={() => navigate("/projects?statut=completed")}
        />
      </div>

      {/* Deux panneaux : prochains rdv + dernière activité */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {/* Prochains rendez-vous */}
        <div style={panelBox}>
          <div style={panelHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={17} color="#59169c" />
              <h2 style={panelTitle}>Prochains rendez-vous</h2>
            </div>
            <button type="button" onClick={() => navigate("/agenda")} style={panelLink}>
              Voir l'agenda
            </button>
          </div>
          {loading ? (
            <div style={panelEmpty}>Chargement…</div>
          ) : upcomingEvents.length === 0 ? (
            <div style={panelEmpty}>Aucun rendez-vous à venir.</div>
          ) : (
            <div>
              {upcomingEvents.map((ev) => {
                const proj = projectById[ev.project_id];
                return (
                  <div
                    key={ev.id}
                    onClick={() => navigate("/agenda")}
                    className="hs-clickable"
                    style={panelRow}
                  >
                    <div style={{ minWidth: 92, fontSize: 12, fontWeight: 700, color: "#59169c" }}>
                      {formatDateTime(ev.start)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, fontSize: 12, color: "#9ca3af" }}>
                        {proj && <span>{proj.client_name || proj.project_name}</span>}
                        {ev.location && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <MapPin size={11} /> {ev.location}
                          </span>
                        )}
                        {ev.link && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <Video size={11} /> visio
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dernière activité */}
        <div style={panelBox}>
          <div style={panelHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={17} color="#82137e" />
              <h2 style={panelTitle}>Dernière activité</h2>
            </div>
          </div>
          {loading ? (
            <div style={panelEmpty}>Chargement…</div>
          ) : recentActivity.length === 0 ? (
            <div style={panelEmpty}>Aucune activité récente.</div>
          ) : (
            <div>
              {recentActivity.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="hs-clickable"
                  style={panelRow}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.project_name}
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      {p.client_name} · mis à jour le {formatDate(p.updated_at || p.created_at)}
                    </div>
                  </div>
                  <StatusPill status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tableau projets récents */}
      <div
        style={{
          background: "white",
          borderRadius: 16,
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px 14px" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>
            Projets récents
          </h2>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Les 5 derniers projets créés
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "16px 24px", color: "#6b7280" }}>Chargement…</div>
        ) : recentProjects.length === 0 ? (
          <div style={{ padding: "16px 24px", color: "#6b7280" }}>
            Aucun projet pour l'instant. Créez-en un dans la page Projets.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "#f9fafb",
                  borderTop: "1px solid #f3f4f6",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <th style={th}>Projet</th>
                <th style={th}>Client</th>
                <th style={th}>Statut</th>
                <th style={th}>Créé le</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map((p, i) => (
                <tr
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="hs-clickable"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid #f3f4f6",
                    cursor: "pointer",
                  }}
                >
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: "#111827" }}>
                      {p.project_name}
                    </span>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      {buildingTypeLabel(p.building_type) || "-"}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{ color: "#374151" }}>{p.client_name}</span>
                  </td>
                  <td style={td}>
                    <StatusPill status={p.status} />
                  </td>
                  <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>
                    {formatDate(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

const panelBox = {
  background: "white",
  borderRadius: 16,
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
};

const panelHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
};

const panelTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const panelLink = {
  border: "none",
  background: "transparent",
  color: "#59169c",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const panelEmpty = {
  padding: "14px 2px",
  color: "#9ca3af",
  fontSize: 13,
};

const panelRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 6px",
  borderTop: "1px solid #f3f4f6",
  borderRadius: 8,
};

const th = {
  padding: "10px 24px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const td = {
  padding: "14px 24px",
  fontSize: 14,
  verticalAlign: "middle",
};
