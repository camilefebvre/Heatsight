import { useEffect, useMemo, useState } from "react";
import { MapPin, Phone, AlertCircle, CalendarDays, Trash2 } from "lucide-react";

const API_URL = "http://127.0.0.1:8000";

// ─── Détection du type depuis le titre ────────────────────────────────────────
function detectType(title = "") {
  const t = title.toLowerCase();
  if (t.includes("visite") || t.includes("terrain") || t.includes("inspection")) return "visite";
  if (t.includes("call") || t.includes("appel") || t.includes("reunion") || t.includes("meeting")) return "call";
  if (t.includes("deadline") || t.includes("limite") || t.includes("rendu") || t.includes("delai")) return "deadline";
  return "autre";
}

const TYPE_CONFIG = {
  visite:   { label: "Visite",    color: "#2563eb", bg: "#eff6ff", Icon: MapPin       },
  call:     { label: "Call",      color: "#16a34a", bg: "#f0fdf4", Icon: Phone        },
  deadline: { label: "Deadline",  color: "#dc2626", bg: "#fef2f2", Icon: AlertCircle  },
  autre:    { label: "Autre",     color: "#64748b", bg: "#f8fafc", Icon: CalendarDays },
};

function formatDate(d) {
  try {
    return new Intl.DateTimeFormat("fr-BE", {
      weekday: "short", day: "2-digit", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

// ─── Composants UI ────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: "white", borderRadius: 16, padding: 20,
      boxShadow: "0 4px 16px rgba(0,0,0,0.06)", ...style }}>
      {children}
    </div>
  );
}

function TypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.autre;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px",
      borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.color,
      color: "white", letterSpacing: "0.03em", flexShrink: 0 }}>
      {cfg.label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb",
  outline: "none", fontSize: 14, color: "#111827", background: "white",
  width: "100%", boxSizing: "border-box",
};

// ─── Page principale ───────────────────────────────────────────────────────────
export default function Agenda() {
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(null);

  const empty = { title: "", start: "", duration_min: 60, location: "", project_id: "", notes: "" };
  const [form, setForm] = useState(empty);

  // ── Chargement initial ─────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/events`).then((r) => r.json()).catch(() => []),
      fetch(`${API_URL}/projects`).then((r) => r.json()).catch(() => []),
    ]).then(([evts, projs]) => {
      setEvents(Array.isArray(evts) ? evts : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setLoading(false);
    });
  }, []);

  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.start) - new Date(b.start)),
    [events]
  );

  function projectName(project_id) {
    return projects.find((p) => p.id === project_id)?.project_name || "";
  }

  function update(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  // ── Créer un événement ────────────────────────────────────────────────────
  async function addEvent(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       form.title,
          start:       form.start,
          duration_min: Number(form.duration_min || 0),
          location:    form.location || null,
          project_id:  form.project_id || null,
          notes:       form.notes || null,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setEvents((prev) => [...prev, created]);
      setForm(empty);
    } catch {
      alert("Erreur lors de la création de l'événement.");
    }
  }

  // ── Supprimer un événement ────────────────────────────────────────────────
  async function removeEvent(id) {
    if (!confirm("Supprimer cet événement ?")) return;
    try {
      await fetch(`${API_URL}/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((x) => x.id !== id));
    } catch {
      alert("Erreur lors de la suppression.");
    }
  }

  function focusStyle(name) {
    return focused === name
      ? { ...inputStyle, borderColor: "#6d28d9", boxShadow: "0 0 0 3px rgba(109,40,217,0.12)" }
      : inputStyle;
  }

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Gestion &amp; Administration</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>Agenda</h1>
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        Visites, appels et deadlines — sauvegardés en base de données.
      </div>

      <div style={{ marginTop: 22, display: "grid",
        gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>

        {/* ── LISTE DES ÉVÉNEMENTS ─────────────────────────────────── */}
        <Card>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#111827" }}>
            Événements à venir
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Visites, appels et deadlines.
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {loading ? (
              <div style={{ color: "#9ca3af", fontSize: 14, padding: "12px 0" }}>
                Chargement…
              </div>
            ) : sorted.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 14, padding: "12px 0" }}>
                Aucun événement pour l'instant.
              </div>
            ) : (
              sorted.map((ev) => {
                const type = detectType(ev.title);
                const cfg = TYPE_CONFIG[type];
                const { Icon } = cfg;

                return (
                  <div key={ev.id} style={{ border: "1px solid #f3f4f6",
                    borderLeft: `4px solid ${cfg.color}`, borderRadius: 12,
                    padding: "14px 16px", display: "grid", gap: 8, background: cfg.bg }}>

                    <div style={{ display: "flex", alignItems: "flex-start",
                      justifyContent: "space-between", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center",
                        gap: 8, flex: 1, minWidth: 0 }}>
                        <Icon size={16} color={cfg.color} strokeWidth={2.2}
                          style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: "#111827",
                          fontSize: 14, lineHeight: 1.3 }}>{ev.title}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center",
                        gap: 8, flexShrink: 0 }}>
                        <TypeBadge type={type} />
                        <button onClick={() => removeEvent(ev.id)}
                          style={{ border: "none", background: "transparent",
                            cursor: "pointer", padding: "4px", borderRadius: 8,
                            display: "flex", alignItems: "center", color: "#9ca3af" }}
                          title="Supprimer">
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {formatDate(ev.start)}
                      {ev.duration_min ? ` • ${ev.duration_min} min` : ""}
                      {ev.location ? ` • ${ev.location}` : ""}
                    </div>

                    {ev.project_id && (
                      <div style={{ fontSize: 12, color: "#374151" }}>
                        <span style={{ fontWeight: 600 }}>Projet :</span>{" "}
                        {projectName(ev.project_id) || ev.project_id}
                      </div>
                    )}

                    {ev.notes && (
                      <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>
                        {ev.notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* ── FORMULAIRE ───────────────────────────────────────────── */}
        <Card>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#111827" }}>
            Nouvel événement
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Remplis les champs et ajoute.
          </div>

          <form onSubmit={addEvent} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <Field label="Titre">
              <input value={form.title} onChange={(e) => update("title", e.target.value)}
                onFocus={() => setFocused("title")} onBlur={() => setFocused(null)}
                style={focusStyle("title")}
                placeholder="Ex: Visite bâtiment, Call client…" required />
            </Field>

            <Field label="Date & heure">
              <input type="datetime-local" value={form.start}
                onChange={(e) => update("start", e.target.value)}
                onFocus={() => setFocused("start")} onBlur={() => setFocused(null)}
                style={focusStyle("start")} required />
            </Field>

            <Field label="Durée (min)">
              <input type="number" min="5" step="5" value={form.duration_min}
                onChange={(e) => update("duration_min", e.target.value)}
                onFocus={() => setFocused("duration")} onBlur={() => setFocused(null)}
                style={focusStyle("duration")} />
            </Field>

            <Field label="Lieu">
              <input value={form.location} onChange={(e) => update("location", e.target.value)}
                onFocus={() => setFocused("location")} onBlur={() => setFocused(null)}
                style={focusStyle("location")} placeholder="Bruxelles, Teams…" />
            </Field>

            <Field label="Projet (optionnel)">
              {projects.length > 0 ? (
                <select value={form.project_id}
                  onChange={(e) => update("project_id", e.target.value)}
                  style={focusStyle("project")}>
                  <option value="">— Aucun projet —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.project_name}</option>
                  ))}
                </select>
              ) : (
                <input value={form.project_id}
                  onChange={(e) => update("project_id", e.target.value)}
                  style={focusStyle("project")} placeholder="Nom du projet…" />
              )}
            </Field>

            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)}
                onFocus={() => setFocused("notes")} onBlur={() => setFocused(null)}
                rows={3} style={{ ...focusStyle("notes"), resize: "vertical" }}
                placeholder="Check-list, documents à apporter…" />
            </Field>

            <button type="submit" style={{ background: "#6d28d9", color: "white",
              border: "none", padding: "11px 14px", borderRadius: 12, fontWeight: 700,
              fontSize: 14, cursor: "pointer", marginTop: 4 }}>
              + Ajouter l'événement
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
