import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Play, Clock, CheckCircle } from "lucide-react";
import StatusPill from "../ui/StatusPill";

const API_URL = "http://127.0.0.1:8000";

function StatCard({ title, value, subtitle, Icon, accentColor }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: "20px 22px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
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
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/projects`);
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

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

      {/* Grille 4 colonnes — cartes statistiques */}
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
          value={loading ? "—" : stats.total}
          subtitle={`${loading ? "—" : stats.newThisMonth} ce mois-ci`}
          Icon={FolderOpen}
          accentColor="#6d28d9"
        />
        <StatCard
          title="Audits en cours"
          value={loading ? "—" : stats.active}
          subtitle="En progression"
          Icon={Play}
          accentColor="#2563eb"
        />
        <StatCard
          title="En attente"
          value={loading ? "—" : stats.onHold}
          subtitle="Mis en pause"
          Icon={Clock}
          accentColor="#ea580c"
        />
        <StatCard
          title="Audits terminés"
          value={loading ? "—" : stats.completed}
          subtitle="Finalisés"
          Icon={CheckCircle}
          accentColor="#16a34a"
        />
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
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid #f3f4f6",
                  }}
                >
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: "#111827" }}>
                      {p.project_name}
                    </span>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                      {p.building_type || "—"}
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
