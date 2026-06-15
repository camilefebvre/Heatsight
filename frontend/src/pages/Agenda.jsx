import { useEffect, useMemo, useState } from "react";
import { MapPin, Phone, AlertCircle, CalendarDays, Trash2, Pencil, Copy, RefreshCw, CalendarClock, Video, Mail } from "lucide-react";
import { apiFetch } from "../api";

// ─── Détection du type depuis le titre ────────────────────────────────────────
function detectType(title = "") {
  const t = title.toLowerCase();
  if (t.includes("visite") || t.includes("terrain") || t.includes("inspection")) return "visite";
  if (t.includes("call") || t.includes("appel") || t.includes("reunion") || t.includes("meeting")) return "call";
  if (t.includes("deadline") || t.includes("limite") || t.includes("rendu") || t.includes("delai")) return "deadline";
  return "autre";
}

const TYPE_CONFIG = {
  rdv:      { label: "Rendez-vous", color: "#59169c", bg: "#faf5ff", Icon: CalendarClock },
  visite:   { label: "Visite",      color: "#2563eb", bg: "#eff6ff", Icon: MapPin        },
  call:     { label: "Appel",       color: "#16a34a", bg: "#f0fdf4", Icon: Phone         },
  deadline: { label: "Échéance",    color: "#dc2626", bg: "#fef2f2", Icon: AlertCircle   },
  autre:    { label: "Autre",       color: "#64748b", bg: "#f8fafc", Icon: CalendarDays  },
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

  const empty = { title: "", start: "", duration_min: 60, location: "", project_id: "", notes: "", type: "rdv", link: "" };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  // Abonnement .ics
  const [sub, setSub] = useState(null);
  const [copied, setCopied] = useState(false);

  // ISO → valeur compatible <input type="datetime-local"> ("YYYY-MM-DDTHH:mm")
  const toLocalInput = (iso) => (iso || "").slice(0, 16);

  // ── Chargement initial ─────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiFetch(`/events`).then((r) => r.json()).catch(() => []),
      apiFetch(`/projects`).then((r) => r.json()).catch(() => []),
    ]).then(([evts, projs]) => {
      setEvents(Array.isArray(evts) ? evts : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    apiFetch("/calendar/subscription").then((r) => (r.ok ? r.json() : null)).then(setSub).catch(() => {});
  }, []);

  async function copySubUrl() {
    try { await navigator.clipboard.writeText(sub.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  async function regenerateSub() {
    if (!confirm("Régénérer le lien ? L'ancien lien cessera de fonctionner.")) return;
    const res = await apiFetch("/calendar/subscription/regenerate", { method: "POST" });
    if (res.ok) setSub(await res.json());
  }

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

  // ── Créer ou modifier un événement ────────────────────────────────────────
  async function submitEvent(e) {
    e.preventDefault();
    const body = {
      title:        form.title,
      start:        form.start,
      duration_min: Number(form.duration_min || 0),
      location:     form.location || null,
      project_id:   form.project_id || null,
      notes:        form.notes || null,
      type:         form.type || null,
      link:         form.link || null,
    };
    try {
      if (editingId) {
        const res = await apiFetch(`/events/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setEvents((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
        setEditingId(null);
        setForm(empty);
      } else {
        const res = await apiFetch(`/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        setEvents((prev) => [...prev, created]);
        setForm(empty);
      }
    } catch {
      alert(editingId ? "Erreur lors de la modification de l'événement." : "Erreur lors de la création de l'événement.");
    }
  }

  function startEdit(ev) {
    setEditingId(ev.id);
    setForm({
      title:        ev.title || "",
      start:        toLocalInput(ev.start),
      duration_min: ev.duration_min ?? 60,
      location:     ev.location || "",
      project_id:   ev.project_id || "",
      notes:        ev.notes || "",
      type:         ev.type || "rdv",
      link:         ev.link || "",
    });
  }

  // ── Brouillon email client (mailto, pur front) ────────────────────────────
  function openClientEmail(ev) {
    const clientEmail = projects.find((p) => p.id === ev.project_id)?.client_email;
    if (!clientEmail) return;
    const subject = `Audit énergétique ${projectName(ev.project_id)} - ${ev.title}`;
    const lines = [
      "Bonjour,",
      "",
      `Je reviens vers vous concernant : ${ev.title}.`,
      `Date : ${formatDate(ev.start)}`,
    ];
    if (ev.location) lines.push(`Lieu : ${ev.location}`);
    if (ev.link) lines.push(`Lien visio : ${ev.link}`);
    lines.push("", "Bien à vous,");
    const body = lines.join("\n");
    const url = `mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(empty);
  }

  // ── Supprimer un événement ────────────────────────────────────────────────
  async function removeEvent(id) {
    if (!confirm("Supprimer cet événement ?")) return;
    try {
      await apiFetch(`/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((x) => x.id !== id));
    } catch {
      alert("Erreur lors de la suppression.");
    }
  }

  function focusStyle(name) {
    return focused === name
      ? { ...inputStyle, borderColor: "#59169c", boxShadow: "0 0 0 3px rgba(89,22,156,0.12)" }
      : inputStyle;
  }

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Gestion &amp; Administration</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>Agenda</h1>
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        Visites, appels et deadlines - sauvegardés en base de données.
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
                const type = ev.type || detectType(ev.title);
                const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.autre;
                const { Icon } = cfg;
                const clientEmail = projects.find((p) => p.id === ev.project_id)?.client_email;

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
                        <button
                          type="button"
                          onClick={() => openClientEmail(ev)}
                          disabled={!clientEmail}
                          title={clientEmail ? "Envoyer un email au client" : "Aucun email client - associez un projet"}
                          style={{
                            border: "none", background: "transparent",
                            cursor: clientEmail ? "pointer" : "not-allowed",
                            padding: 4, borderRadius: 8,
                            display: "flex", alignItems: "center",
                            color: clientEmail ? "#59169c" : "#cbd5e1",
                          }}
                        >
                          <Mail size={14} strokeWidth={2} />
                        </button>
                        <button onClick={() => startEdit(ev)}
                          style={{ border: "none", background: "transparent",
                            cursor: "pointer", padding: "4px", borderRadius: 8,
                            display: "flex", alignItems: "center", color: "#59169c" }}
                          title="Modifier">
                          <Pencil size={14} strokeWidth={2} />
                        </button>
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

                    {ev.link && (
                      <div style={{ fontSize: 12 }}>
                        <a href={/^https?:\/\//i.test(ev.link) ? ev.link : `https://${ev.link}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: "#59169c", fontWeight: 600, textDecoration: "none",
                            display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Video size={13} strokeWidth={2} /> Lien visio
                        </a>
                      </div>
                    )}

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
            {editingId ? "Modifier l'événement" : "Nouvel événement"}
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            {editingId ? "Modifiez les champs et enregistrez." : "Remplissez les champs et ajoutez."}
          </div>

          <form onSubmit={submitEvent} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <Field label="Titre">
              <input value={form.title} onChange={(e) => update("title", e.target.value)}
                onFocus={() => setFocused("title")} onBlur={() => setFocused(null)}
                style={focusStyle("title")}
                placeholder="Ex: Visite bâtiment, Call client…" required />
            </Field>

            <Field label="Type">
              <select value={form.type} onChange={(e) => update("type", e.target.value)}
                onFocus={() => setFocused("type")} onBlur={() => setFocused(null)}
                style={focusStyle("type")}>
                <option value="rdv">Rendez-vous</option>
                <option value="visite">Visite</option>
                <option value="call">Appel</option>
                <option value="deadline">Échéance</option>
                <option value="autre">Autre</option>
              </select>
            </Field>

            {(form.type === "call" || form.type === "rdv") && (
              <Field label="Lien (visio)">
                <input value={form.link} onChange={(e) => update("link", e.target.value)}
                  onFocus={() => setFocused("link")} onBlur={() => setFocused(null)}
                  style={focusStyle("link")} placeholder="https://…" />
              </Field>
            )}

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
                  <option value="">- Aucun projet -</option>
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

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="submit" style={{ flex: 1, background: "#59169c", color: "white",
                border: "none", padding: "11px 14px", borderRadius: 12, fontWeight: 700,
                fontSize: 14, cursor: "pointer" }}>
                {editingId ? "Enregistrer les modifications" : "+ Ajouter l'événement"}
              </button>
              {editingId && (
                <button type="button" onClick={cancelEdit} style={{ background: "white",
                  color: "#374151", border: "1px solid #e5e7eb", padding: "11px 14px",
                  borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  Annuler
                </button>
              )}
            </div>
          </form>
        </Card>
      </div>

      {sub && (
        <Card style={{ marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 17, color: "#111827" }}>
            <CalendarDays size={18} color="#59169c" /> Ajouter à mon calendrier
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
            Abonnez Google Agenda, Outlook ou Apple Calendrier à ce lien - lecture seule, mise à jour automatique.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <input readOnly value={sub.url} onFocus={(e) => e.target.select()}
              style={{ flex: "1 1 320px", minWidth: 0, padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 13, color: "#374151", background: "#f9fafb" }} />
            <button type="button" onClick={copySubUrl}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#59169c", color: "white", border: "none", padding: "9px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Copy size={14} /> {copied ? "Copié !" : "Copier"}
            </button>
            <a href={sub.webcal_url}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white", color: "#59169c", border: "1px solid #c4b5fd", padding: "9px 14px", borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Ouvrir (webcal)
            </a>
            <button type="button" onClick={regenerateSub}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white", color: "#6b7280", border: "1px solid #e5e7eb", padding: "9px 14px", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              <RefreshCw size={14} /> Régénérer
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
            <b>Google Agenda</b> : Autres agendas → À partir de l'URL → coller le lien.<br />
            <b>Outlook</b> : Ajouter un calendrier → S'abonner à partir du web → coller le lien.<br />
            <b>Apple Calendrier</b> : Fichier → Nouvel abonnement → coller le lien.
          </div>
        </Card>
      )}
    </div>
  );
}
