const docs = [
  { name: "Building Blueprint.pdf", type: "Plan", date: "2023-10-15" },
  { name: "Facade_East.jpg", type: "Photo", date: "2023-10-16" },
  { name: "Initial Quote.pdf", type: "Quote", date: "2023-10-17" },
];

export default function Documents() {
  return (
    <div>
      <div style={{ color: "#6b7280" }}>Document Management</div>
      <h1 style={{ fontSize: 40, margin: "10px 0 18px" }}>
        Document Management
      </h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <select style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <option>Downtown Office Complex</option>
          <option>School Renovation</option>
        </select>

        <button
          style={{
            background: "#6d28d9",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          ⬆️ Upload Document
        </button>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
          maxWidth: 900,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Project Documents</h2>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#6b7280", textAlign: "left" }}>
              <th style={{ padding: "10px 8px" }}>Name</th>
              <th style={{ padding: "10px 8px" }}>Type</th>
              <th style={{ padding: "10px 8px" }}>Date Added</th>
              <th style={{ padding: "10px 8px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.name} style={{ borderTop: "1px solid #eef2f7" }}>
                <td style={{ padding: "12px 8px" }}>{d.name}</td>
                <td style={{ padding: "12px 8px", color: "#6b7280" }}>{d.type}</td>
                <td style={{ padding: "12px 8px", color: "#6b7280" }}>{d.date}</td>
                <td style={{ padding: "12px 8px" }}>⋮</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
