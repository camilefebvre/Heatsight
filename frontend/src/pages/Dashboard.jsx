import { useEffect, useMemo, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

function StatCard({ title, value, subtitle, icon }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <div style={{ color: "#6b7280", fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
          {value}
        </div>
        <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 6 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ fontSize: 24 }}>{icon}</div>
    </div>
  );
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
    <div>
      {/* Breadcrumb */}
      <div style={{ color: "#6b7280" }}>Dashboard</div>

      {/* Title */}
      <h1 style={{ fontSize: 40, margin: "10px 0 24px" }}>
        Auditor Dashboard
      </h1>

      {/* 🔥 MAIN GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN */}
        <div style={{ display: "grid", gap: 16 }}>
          <StatCard
            title="Total Projects"
            value={loading ? "—" : stats.total}
            subtitle={`${loading ? "—" : stats.newThisMonth} new this month`}
            icon="🧳"
          />
          <StatCard
            title="Active Audits"
            value={loading ? "—" : stats.active}
            subtitle="In progress"
            icon="▶️"
          />
          <StatCard
            title="Projects On Hold"
            value={loading ? "—" : stats.onHold}
            subtitle="Paused"
            icon="⏳"
          />
          <StatCard
            title="Completed Audits"
            value={loading ? "—" : stats.completed}
            subtitle="Finished"
            icon="✅"
          />
        </div>

        {/* RIGHT COLUMN */}
        <div
          style={{
            background: "white",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            minHeight: 300,
          }}
        >
          <h2 style={{ margin: 0 }}>Recent Projects</h2>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            Latest projects created (from the API).
          </div>

          {loading ? (
            <div style={{ marginTop: 14, color: "#6b7280" }}>Loading…</div>
          ) : recentProjects.length === 0 ? (
            <div style={{ marginTop: 14, color: "#6b7280" }}>
              No projects yet. Create one in the Projects page.
            </div>
          ) : (
            <ul style={{ marginTop: 16, paddingLeft: 18 }}>
              {recentProjects.map((p) => (
                <li key={p.id}>
                  <b>{p.project_name}</b> — {p.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
