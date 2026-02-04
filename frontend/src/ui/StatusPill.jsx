export default function StatusPill({ status = "draft" }) {
  const map = {
    draft:      { label: "Draft",       bg: "#eef2ff", color: "#3730a3", border: "#c7d2fe" },
    in_progress:{ label: "In progress", bg: "#ecfeff", color: "#155e75", border: "#a5f3fc" },
    on_hold:    { label: "On hold",     bg: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    completed:  { label: "Completed",   bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" },
  };

  const s = map[status] || map.draft;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 999,
        fontWeight: 900,
        fontSize: 13,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {s.label}
    </span>
  );
}
