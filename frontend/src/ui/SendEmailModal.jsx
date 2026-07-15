import { useEffect, useRef, useState } from "react";
import { Send, Copy, X, Mail } from "lucide-react";

// ── Construction des URL de composition selon le service ─────────────────────
export function buildMailUrls({ to = "", subject = "", body = "" }) {
  const su = encodeURIComponent(subject);
  const bd = encodeURIComponent(body);
  const rcpt = encodeURIComponent(to);
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${rcpt}&su=${su}&body=${bd}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?to=${rcpt}&subject=${su}&body=${bd}`,
    mailto: `mailto:${to}?subject=${su}&body=${bd}`,
  };
}

function openMail(kind, payload) {
  const urls = buildMailUrls(payload);
  if (kind === "mailto") {
    window.location.href = urls.mailto;
  } else {
    window.open(urls[kind], "_blank", "noopener");
  }
}

const PROVIDERS = [
  { kind: "gmail", label: "Gmail", color: "#ea4335" },
  { kind: "outlook", label: "Outlook", color: "#0078d4" },
  { kind: "mailto", label: "Appli de messagerie par défaut", color: "#6b7280" },
];

// ── Bouton « Envoyer » + menu de choix du service (réutilisable) ─────────────
export function SendViaMenu({ to, subject, body, disabled = false, buttonStyle, label = "Envoyer", onSend }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function choose(kind) {
    setOpen(false);
    if (onSend) onSend(kind);       // ex. enregistrer/tracer la demande avant d'ouvrir le mail
    openMail(kind, { to, subject, body });
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={
          buttonStyle || {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 14px",
            borderRadius: 10,
            border: "none",
            background: "#59169c",
            color: "white",
            fontWeight: 700,
            fontSize: 13,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }
        }
        title="Envoyer le mail"
      >
        <Send size={15} /> {label}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            minWidth: 250,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
            padding: 6,
            zIndex: 1200,
          }}
        >
          {PROVIDERS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => choose(p.kind)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13.5,
                fontWeight: 600,
                color: "#374151",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f3ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Mail size={16} color={p.color} style={{ flexShrink: 0 }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Fenêtre complète : aperçu éditable + copier + envoyer ────────────────────
export default function SendEmailModal({
  open,
  onClose,
  to = "",
  subject: initialSubject = "",
  body: initialBody = "",
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject(initialSubject);
      setBody(initialBody);
      setCopied(false);
    }
  }, [open, initialSubject, initialBody]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible : on ignore */
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 18,
          padding: 26,
          maxWidth: 620,
          width: "100%",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>Envoyer un email</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
              {to ? `Destinataire : ${to}` : "Adresse email non renseignée"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #e5e7eb",
              background: "white",
              padding: 8,
              borderRadius: 10,
              cursor: "pointer",
              display: "flex",
            }}
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Objet */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Objet
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Corps */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              height: 240,
              padding: "14px 16px",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.7,
              color: "#374151",
              resize: "vertical",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#374151",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <Copy size={15} /> {copied ? "Copié !" : "Copier"}
          </button>
          <SendViaMenu to={to} subject={subject} body={body} disabled={!to} />
        </div>
      </div>
    </div>
  );
}
