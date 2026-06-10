export default function StatusPill({ status = "draft" }) {
  const map = {
    draft:       { label: "Brouillon",   bg: "#64748b" },
    in_progress: { label: "En cours",    bg: "#59169c" },
    on_hold:     { label: "En attente",  bg: "#fe9300", fg: "#5c3600" },
    completed:   { label: "Terminé",     bg: "#82137e" },
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
        color: s.fg || "white",
        letterSpacing: "0.02em",
        userSelect: "none",
      }}
    >
      {s.label}
    </span>
  );
}
