export default function StatusPill({ status = "draft" }) {
  const map = {
    draft:       { label: "Brouillon",   bg: "#64748b" },
    in_progress: { label: "En cours",    bg: "#6d28d9" },
    on_hold:     { label: "En attente",  bg: "#ea580c" },
    completed:   { label: "Terminé",     bg: "#16a34a" },
  };

  const s = map[status] || map.draft;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        background: s.bg,
        color: "white",
        letterSpacing: "0.02em",
        userSelect: "none",
      }}
    >
      {s.label}
    </span>
  );
}
