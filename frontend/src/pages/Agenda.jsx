import { useEffect, useMemo, useState } from "react";
import { MapPin, Phone, AlertCircle, CalendarDays, Trash2, Copy, RefreshCw, CalendarClock, Mail, X } from "lucide-react";
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

// ─── Vue semaine : constantes & helpers ───────────────────────────────────────
const HOUR_START = 7;
const HOUR_END = 21;          // plage horaire affichée (modifiable ici)
const HOUR_PX = 48;           // hauteur d'une heure, en px
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const PX_PER_MIN = HOUR_PX / 60;            // 0.8
const GRID_HEIGHT = HOURS.length * HOUR_PX; // hauteur totale de la grille (px)

// Lundi 00:00 local de la semaine de `date` (jamais d'UTC)
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - dow);
  return d;
}

// Index du jour (0-6) de l'event dans `days`, ou -1 (comparaison locale y/m/j).
function dayIndexOf(ev, days) {
  const d = new Date(ev.start);
  if (isNaN(d.getTime())) return -1;
  return days.findIndex((day) =>
    day.getFullYear() === d.getFullYear() &&
    day.getMonth() === d.getMonth() &&
    day.getDate() === d.getDate()
  );
}

// Placement d'un event dans la grille (heure locale uniquement, jamais d'UTC).
// Retourne { dayIndex, top, height } ou null si hors semaine visible.
function placeEvent(ev, days) {
  const dayIndex = dayIndexOf(ev, days);
  if (dayIndex === -1) return null;
  const d = new Date(ev.start);
  const minutesFromStart = (d.getHours() * 60 + d.getMinutes()) - HOUR_START * 60;
  const top = Math.max(0, Math.min(minutesFromStart * PX_PER_MIN, GRID_HEIGHT));
  let height = Math.max((ev.duration_min || 0) * PX_PER_MIN, 22); // min cliquable
  if (top + height > GRID_HEIGHT) height = GRID_HEIGHT - top;      // borne le bas
  return { dayIndex, top, height };
}

// Event à reléguer dans la bande "hors horaire" (heure locale uniquement) :
// échéance, ou début hors [HOUR_START, HOUR_END), ou durée nulle/absente.
function isBandEvent(ev) {
  if (ev.type === "deadline") return true;
  if (!ev.duration_min) return true;
  const d = new Date(ev.start);
  if (isNaN(d.getTime())) return false;
  const h = d.getHours();
  return h < HOUR_START || h >= HOUR_END;
}

// Répartit en sous-colonnes les events grille qui se chevauchent (packing par colonnes).
// Mute chaque item (qui porte startMin/endMin) en lui ajoutant col, cols, leftPct, widthPct.
function layoutOverlaps(items) {
  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster = [];   // items du cluster (chevauchement transitif) courant
  let colEnds = [];   // endMin du dernier event de chaque colonne active
  const flush = () => {
    const cols = colEnds.length;
    for (const it of cluster) it.cols = cols;
    cluster = [];
    colEnds = [];
  };
  for (const it of items) {
    // Nouveau cluster si l'event commence après la fin de TOUTES les colonnes actives
    if (colEnds.length && it.startMin >= Math.max(...colEnds)) flush();
    // Première colonne libre (dernier event terminé), sinon nouvelle colonne
    let col = colEnds.findIndex((end) => end <= it.startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(it.endMin); }
    else colEnds[col] = it.endMin;
    it.col = col;
    cluster.push(it);
  }
  flush();
  for (const it of items) {
    const cols = it.cols || 1;
    it.leftPct = (it.col / cols) * 100;
    it.widthPct = (1 / cols) * 100;
  }
}

// Date locale → "YYYY-MM-DDTHH:mm" (construit manuellement, jamais toISOString/UTC)
function fmtLocalInput(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
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
  const [focused, setFocused] = useState(null);

  const empty = { title: "", start: "", duration_min: 60, location: "", project_id: "", notes: "", type: "rdv", link: "" };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  // Abonnement .ics
  const [sub, setSub] = useState(null);
  const [copied, setCopied] = useState(false);

  // Vue semaine
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

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
    });
  }, []);

  useEffect(() => {
    apiFetch("/calendar/subscription").then((r) => (r.ok ? r.json() : null)).then(setSub).catch(() => {});
  }, []);

  // Fermeture de la modale ouverte sur Échap
  useEffect(() => {
    if (!modalOpen && !subOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (subOpen) setSubOpen(false);
      else if (modalOpen) cancelEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, subOpen]);

  // Ligne "maintenant" : rafraîchit l'heure chaque minute (cleanup au démontage)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
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

  // ── Vue semaine : dérivés & navigation ─────────────────────────────────────
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart]
  );

  const weekLabel = useMemo(() => {
    const a = days[0], b = days[6];
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameMonth
      ? `${a.getDate()} - ${b.getDate()} ${b.toLocaleDateString("fr-BE", { month: "long", year: "numeric" })}`
      : `${a.toLocaleDateString("fr-BE", { day: "numeric", month: "short" })} - ${b.toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [days]);

  // Events de la semaine visible, par jour (0=lun … 6=dim) : { grid, band }
  const weekEvents = useMemo(() => {
    const byDay = Array.from({ length: 7 }, () => ({ grid: [], band: [] }));
    for (const ev of sorted) {
      if (isBandEvent(ev)) {
        const di = dayIndexOf(ev, days);
        if (di !== -1) byDay[di].band.push(ev);
      } else {
        const pos = placeEvent(ev, days);
        if (pos) {
          const d = new Date(ev.start);
          const startMin = d.getHours() * 60 + d.getMinutes();
          const endMin = startMin + (ev.duration_min || 0);
          byDay[pos.dayIndex].grid.push({ ev, top: pos.top, height: pos.height, startMin, endMin });
        }
      }
    }
    // Répartition des chevauchements en sous-colonnes, par jour
    for (const day of byDay) layoutOverlaps(day.grid);
    return byDay;
  }, [sorted, days]);

  function shiftWeek(deltaDays) {
    setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() + deltaDays); return d; });
  }
  function goToday() { setWeekStart(startOfWeek(new Date())); }

  const isToday = (d) => {
    const n = new Date();
    return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  };
  const dayHeader = (d) => {
    const wd = d.toLocaleDateString("fr-BE", { weekday: "short" }).replace(".", "");
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d.getDate()}`;
  };

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
        setModalOpen(false);
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
        setModalOpen(false);
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
    setModalOpen(true);
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
    setModalOpen(false);
  }

  // ── Ouverture de la modale en création ─────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm(empty);
    setModalOpen(true);
  }
  function openCreateAt(day, hour) {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    setEditingId(null);
    setForm({ ...empty, start: fmtLocalInput(d) });
    setModalOpen(true);
  }

  // ── Supprimer un événement ────────────────────────────────────────────────
  async function removeEvent(id) {
    if (!confirm("Supprimer cet événement ?")) return false;
    try {
      await apiFetch(`/events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((x) => x.id !== id));
      return true;
    } catch {
      alert("Erreur lors de la suppression.");
      return false;
    }
  }

  function focusStyle(name) {
    return focused === name
      ? { ...inputStyle, borderColor: "#59169c", boxShadow: "0 0 0 3px rgba(89,22,156,0.12)" }
      : inputStyle;
  }

  // Event en cours d'édition (pour les actions email/suppr de la modale)
  const editingEvent = editingId ? events.find((x) => x.id === editingId) : null;
  const editClientEmail = editingEvent ? projects.find((p) => p.id === editingEvent.project_id)?.client_email : null;

  // Ligne "maintenant" (heure locale)
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMin >= HOUR_START * 60 && nowMin <= HOUR_END * 60;
  const nowTop = (nowMin - HOUR_START * 60) * PX_PER_MIN;

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Gestion &amp; Administration</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>Agenda</h1>
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        Visites, appels et deadlines - sauvegardés en base de données.
      </div>

      {/* ── VUE SEMAINE (échafaudage — étape 1) ───────────────────── */}
      <Card style={{ marginTop: 22, padding: 0, overflow: "hidden" }}>

        {/* Barre d'outils */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
          <button type="button" onClick={() => shiftWeek(-7)} title="Semaine précédente"
            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#374151", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ‹
          </button>
          <button type="button" onClick={() => shiftWeek(7)} title="Semaine suivante"
            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#374151", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ›
          </button>
          <button type="button" onClick={goToday}
            style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "1px solid #c4b5fd", background: "white", color: "#59169c", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Aujourd'hui
          </button>
          <div style={{ marginLeft: 6, fontWeight: 800, fontSize: 16, color: "#111827", textTransform: "capitalize" }}>
            {weekLabel}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {sub && (
              <button type="button" onClick={() => setSubOpen(true)}
                style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "1px solid #c4b5fd", background: "white", color: "#59169c", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CalendarDays size={14} /> S'abonner
              </button>
            )}
            <button type="button" onClick={openCreate}
              style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: "#59169c", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              + Nouvel événement
            </button>
          </div>
        </div>

        {/* Repli responsive : scroll horizontal partagé en-têtes + bande + corps */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 700 }}>

        {/* En-têtes des jours */}
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid #ede9fe" }}>
          <div />
          {days.map((d, i) => {
            const today = isToday(d);
            return (
              <div key={i} style={{ textAlign: "center", padding: "8px 4px", fontSize: 13, fontWeight: 700,
                color: today ? "#59169c" : "#6b7280", background: today ? "#faf5ff" : "transparent",
                borderLeft: "1px solid #f3f4f6" }}>
                {dayHeader(d)}
              </div>
            );
          })}
        </div>

        {/* Bande "hors horaire / échéances" — affichée seulement si nécessaire */}
        {weekEvents.some((d) => d.band.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderBottom: "1px solid #ede9fe", background: "#fafafa" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "4px 6px", fontSize: 10, color: "#9ca3af", textAlign: "right", lineHeight: 1.2 }}>
              Hors horaire
            </div>
            {days.map((d, i) => {
              const today = isToday(d);
              return (
                <div key={i} style={{ borderLeft: "1px solid #f3f4f6", background: today ? "#faf5ff" : "transparent",
                  padding: 3, display: "flex", flexWrap: "wrap", gap: 3, alignContent: "flex-start" }}>
                  {weekEvents[i].band.map((ev) => {
                    const type = ev.type || detectType(ev.title);
                    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.autre;
                    return (
                      <div key={ev.id}
                        onClick={(e) => { e.stopPropagation(); startEdit(ev); }}
                        title={ev.title}
                        style={{ width: "100%", background: cfg.bg, borderLeft: `3px solid ${cfg.color}`, borderRadius: 6,
                          padding: "2px 6px", fontSize: 11, cursor: "pointer", boxSizing: "border-box",
                          display: "flex", gap: 4, alignItems: "baseline" }}>
                        <span style={{ fontWeight: 700, color: cfg.color, flexShrink: 0 }}>
                          {ev.start.slice(11, 16)}
                        </span>
                        <span style={{ color: "#111827", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {ev.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Conteneur scroll vertical */}
        <div style={{ maxHeight: 560, overflowY: "auto", scrollbarGutter: "stable" }}>
        {/* Corps : colonne heures + 7 colonnes jours */}
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          {/* Colonne des heures */}
          <div>
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_PX, position: "relative", borderTop: "1px solid #f3f4f6" }}>
                <span style={{ position: "absolute", top: -8, right: 6, fontSize: 11, color: "#9ca3af" }}>{h}h</span>
              </div>
            ))}
          </div>

          {/* Colonnes des jours (position:relative pour les blocs des étapes suivantes) */}
          {days.map((d, i) => {
            const today = isToday(d);
            return (
              <div key={i} style={{ position: "relative", borderLeft: "1px solid #f3f4f6",
                background: today ? "#faf5ff" : "transparent" }}>
                {HOURS.map((h) => (
                  <div key={h} onClick={() => openCreateAt(days[i], h)}
                    style={{ height: HOUR_PX, borderTop: "1px solid #f3f4f6", cursor: "pointer" }} />
                ))}
                {weekEvents[i].grid.map(({ ev, top, height, leftPct, widthPct }) => {
                  const type = ev.type || detectType(ev.title);
                  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.autre;
                  return (
                    <div key={ev.id}
                      onClick={(e) => { e.stopPropagation(); startEdit(ev); }}
                      title={ev.title}
                      style={{ position: "absolute", top, height,
                        left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                        background: cfg.bg, borderLeft: `3px solid ${cfg.color}`, borderRadius: 6,
                        padding: "2px 6px", fontSize: 11, overflow: "hidden", cursor: "pointer",
                        boxSizing: "border-box", display: "flex", gap: 4, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, color: cfg.color, flexShrink: 0 }}>
                        {ev.start.slice(11, 16)}
                      </span>
                      <span style={{ color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ev.title}
                      </span>
                    </div>
                  );
                })}
                {today && showNowLine && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 2, background: "#dc2626", zIndex: 5, pointerEvents: "none" }}>
                    <div style={{ position: "absolute", left: -3, top: -3, width: 8, height: 8, borderRadius: "50%", background: "#dc2626" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>{/* fin scroll vertical */}
          </div>{/* fin largeur min 700 */}
        </div>{/* fin scroll horizontal */}
      </Card>

      {/* ── MODALE FORMULAIRE ─────────────────────────────────────── */}
      {modalOpen && (
        <div onClick={cancelEdit}
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", zIndex: 1000,
            display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
              width: "100%", maxWidth: 460, maxHeight: "90vh", overflow: "auto", padding: 22, boxSizing: "border-box" }}>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: "#111827" }}>
                  {editingId ? "Modifier l'événement" : "Nouvel événement"}
                </div>
                <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                  {editingId ? "Modifiez les champs et enregistrez." : "Remplissez les champs et ajoutez."}
                </div>
              </div>
              <button type="button" onClick={cancelEdit} title="Fermer"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", padding: 4, borderRadius: 8, display: "flex", alignItems: "center", flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitEvent} style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <Field label="Titre">
                <input value={form.title} onChange={(e) => update("title", e.target.value)}
                  onFocus={() => setFocused("title")} onBlur={() => setFocused(null)}
                  style={focusStyle("title")} placeholder="Ex: Visite bâtiment, Call client…" required />
              </Field>

              <Field label="Type">
                <select value={form.type} onChange={(e) => update("type", e.target.value)}
                  onFocus={() => setFocused("type")} onBlur={() => setFocused(null)} style={focusStyle("type")}>
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
                  <select value={form.project_id} onChange={(e) => update("project_id", e.target.value)} style={focusStyle("project")}>
                    <option value="">- Aucun projet -</option>
                    {projects.map((p) => (<option key={p.id} value={p.id}>{p.project_name}</option>))}
                  </select>
                ) : (
                  <input value={form.project_id} onChange={(e) => update("project_id", e.target.value)}
                    style={focusStyle("project")} placeholder="Nom du projet…" />
                )}
              </Field>

              <Field label="Notes">
                <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)}
                  onFocus={() => setFocused("notes")} onBlur={() => setFocused(null)}
                  rows={3} style={{ ...focusStyle("notes"), resize: "vertical" }}
                  placeholder="Check-list, documents à apporter…" />
              </Field>

              <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
                {editingId && (
                  <>
                    <button type="button" onClick={() => openClientEmail(editingEvent)} disabled={!editClientEmail}
                      title={editClientEmail ? "Envoyer un email au client" : "Aucun email client - associez un projet"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white",
                        color: editClientEmail ? "#59169c" : "#cbd5e1", border: "1px solid #e5e7eb",
                        padding: "11px 14px", borderRadius: 12, fontWeight: 600, fontSize: 14,
                        cursor: editClientEmail ? "pointer" : "not-allowed" }}>
                      <Mail size={15} /> Email client
                    </button>
                    <button type="button" onClick={async () => { if (await removeEvent(editingId)) cancelEdit(); }}
                      title="Supprimer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "white",
                        color: "#dc2626", border: "1px solid #fecaca", padding: "11px 14px", borderRadius: 12,
                        fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                      <Trash2 size={15} /> Supprimer
                    </button>
                  </>
                )}
                <button type="submit" style={{ marginLeft: editingId ? "auto" : 0, flex: editingId ? "0 0 auto" : 1,
                  background: "#59169c", color: "white", border: "none", padding: "11px 14px", borderRadius: 12,
                  fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {editingId ? "Enregistrer les modifications" : "+ Ajouter l'événement"}
                </button>
                <button type="button" onClick={cancelEdit} style={{ background: "white",
                  color: "#374151", border: "1px solid #e5e7eb", padding: "11px 14px", borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODALE ABONNEMENT .ics ─────────────────────────────────── */}
      {subOpen && sub && (
        <div onClick={() => setSubOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", zIndex: 1000,
            display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
              width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", padding: 22, boxSizing: "border-box" }}>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 17, color: "#111827" }}>
                <CalendarDays size={18} color="#59169c" /> Ajouter à mon calendrier
              </div>
              <button type="button" onClick={() => setSubOpen(false)} title="Fermer"
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", padding: 4, borderRadius: 8, display: "flex", alignItems: "center", flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 8 }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
