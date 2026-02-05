import { useMemo, useState } from "react";

function formatDate(d) {
  try {
    return new Intl.DateTimeFormat("fr-BE", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function Agenda() {
  // MVP: events en mémoire (non persistant)
  const [events, setEvents] = useState([
    {
      id: "1",
      title: "Visite bâtiment — Downtown Office Complex",
      start: "2026-02-06T09:00",
      durationMin: 90,
      location: "Bruxelles",
      project: "Downtown Office Complex",
      notes: "Prendre plans + photos façades.",
    },
    {
      id: "2",
      title: "Call client — School Renovation",
      start: "2026-02-07T14:30",
      durationMin: 30,
      location: "Teams",
      project: "School Renovation",
      notes: "Confirmer factures + données conso.",
    },
  ]);

  const empty = {
    title: "",
    start: "",
    durationMin: 60,
    location: "",
    project: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);

  const sorted = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [events]);

  function update(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function addEvent(e) {
    e.preventDefault();
    const newEvent = {
      id: crypto.randomUUID(),
      ...form,
      durationMin: Number(form.durationMin || 0),
    };
    setEvents((p) => [newEvent, ...p]);
    setForm(empty);
  }

  function removeEvent(id) {
    if (!confirm("Supprimer cet évènement ?")) return;
    setEvents((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div style={{ color: "#6b7280" }}>Core</div>
      <h1 style={{ fontSize: 40, margin: "10px 0 6px" }}>Agenda</h1>
      <div style={{ color: "#6b7280" }}>
        Planning simple (MVP) — à connecter plus tard aux projets et au backend.
      </div>

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        {/* LISTE */}
        <Card>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Upcoming</div>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            Tes prochains rendez-vous (visites, calls, deadlines).
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {sorted.length === 0 ? (
              <div style={{ color: "#6b7280" }}>Aucun évènement.</div>
            ) : (
              sorted.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    border: "1px solid #eef2f7",
                    borderRadius: 14,
                    padding: 12,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{ev.title}</div>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "white",
                        borderRadius: 10,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                      title="Supprimer"
                    >
                      🗑️
                    </button>
                  </div>

                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    {formatDate(ev.start)} • {ev.durationMin} min • {ev.location || "—"}
                  </div>

                  <div style={{ fontSize: 13 }}>
                    <b>Projet :</b> {ev.project || "—"}
                  </div>

                  {ev.notes ? (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      {ev.notes}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* FORM */}
        <Card>
          <div style={{ fontWeight: 900, fontSize: 18 }}>New event</div>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            Ajoute rapidement un rendez-vous.
          </div>

          <form onSubmit={addEvent} style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Title</span>
              <input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                required
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Date & time</span>
              <input
                type="datetime-local"
                value={form.start}
                onChange={(e) => update("start", e.target.value)}
                required
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Duration (min)</span>
              <input
                type="number"
                min="5"
                step="5"
                value={form.durationMin}
                onChange={(e) => update("durationMin", e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Location</span>
              <input
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Bruxelles / Teams / ..."
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Project (optional)</span>
              <input
                value={form.project}
                onChange={(e) => update("project", e.target.value)}
                placeholder="Downtown Office Complex…"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={3}
                placeholder="Check-list, documents à demander…"
              />
            </label>

            <button
              type="submit"
              style={{
                background: "#6d28d9",
                color: "white",
                border: "none",
                padding: "12px 14px",
                borderRadius: 12,
                fontWeight: 900,
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              + Add event
            </button>

            <style>{`
              input, textarea {
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid #e5e7eb;
                outline: none;
                font-size: 14px;
              }
              input:focus, textarea:focus {
                border-color: #6d28d9;
                box-shadow: 0 0 0 3px rgba(109,40,217,0.15);
              }
              textarea { resize: vertical; }
            `}</style>
          </form>
        </Card>
      </div>
    </div>
  );
}
