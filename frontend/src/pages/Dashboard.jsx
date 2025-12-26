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
          gridTemplateColumns: "380px 1fr", // 👈 gauche fixe, droite prend TOUT
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN */}
        <div style={{ display: "grid", gap: 16 }}>
          <StatCard title="Total Projects" value="48" subtitle="5 new this month" icon="🧳" />
          <StatCard title="Active Audits" value="12" subtitle="3 starting soon" icon="▶️" />
          <StatCard title="Projects On Hold" value="3" subtitle="1 recently paused" icon="⏳" />
          <StatCard title="Completed Audits" value="32" subtitle="2 completed this week" icon="✅" />
        </div>

        {/* RIGHT COLUMN (fills white space) */}
        <div
          style={{
            background: "white",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
            minHeight: 300,
          }}
        >
          <h2 style={{ margin: 0 }}>Recent Audits</h2>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            An overview of your latest projects.
          </div>

          <ul style={{ marginTop: 16, paddingLeft: 18 }}>
            <li>Downtown Office Complex — in progress</li>
            <li>School Renovation — documents pending</li>
            <li>Warehouse Heating Upgrade — report draft</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
