import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { apiFetch } from "../api";
import { SendViaMenu } from "./SendEmailModal";

// Message générique (onglet Demandes) — ne parle pas de documents.
const GENERIC_TEMPLATE =
  "Bonjour [nom du client],\n\nDans le cadre de l'audit énergétique [nom de l'audit], nous revenons vers vous.\n\nBien à vous,";

// Message orienté documents (onglet Fichiers) — la liste des documents est écrite dedans.
const DOCS_TEMPLATE =
  "Bonjour [nom du client],\n\nDans le cadre de l'audit énergétique [nom de l'audit], merci de nous transmettre les documents suivants :\n\n{{DOCS}}\n\nBien à vous,";

// Remplace les balises par les vraies valeurs — appliqué à l'ENVOI / l'enregistrement.
function resolveTokens(text, project) {
  return (text || "")
    .split("[nom du client]").join(project?.client_name || "")
    .split("[nom de l'audit]").join(project?.project_name || "");
}

// Message documents : on garde les balises de nom, on injecte seulement la liste.
function buildDocsMessage(labels) {
  const list = labels.length ? labels.map((l) => `  • ${l}`).join("\n") : "  • (aucun)";
  return DOCS_TEMPLATE.replace("{{DOCS}}", list);
}

const inputStyle = {
  padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
  fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none",
};
const btnSecondary = {
  background: "white", color: "#374151", border: "1px solid #e5e7eb",
  padding: "11px 16px", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14,
};

// Modal unique : composer / renvoyer une demande (email) au client.
export default function ClientRequestModal({ open, onClose, project, projectId, existing, initialDocuments, withDocuments = false, onSaved }) {
  const [recipients, setRecipients] = useState([""]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const messageRef = useRef(null);

  const availableEmails = [
    ...new Set([project?.client_email, ...(project?.client_emails || [])].filter(Boolean)),
  ];

  // (Ré)initialisation à l'ouverture
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setRecipients((existing.client_email || "").split(",").map((s) => s.trim()).filter(Boolean) || [""]);
      setMessage(existing.message || resolveTokens(GENERIC_TEMPLATE, project));
    } else {
      setRecipients(project?.client_email ? [project.client_email] : [""]);
      if (withDocuments) {
        const labels = (initialDocuments || []).map((d) => (d.label || "").trim()).filter(Boolean);
        setMessage(resolveTokens(buildDocsMessage(labels), project));
      } else {
        setMessage(resolveTokens(GENERIC_TEMPLATE, project));
      }
    }
    // On ne réinitialise qu'à l'ouverture (évite d'écraser la saisie sur re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const setRecipient = (i, v) => setRecipients((r) => r.map((x, j) => (j === i ? v : x)));
  const addRecipient = (v) => setRecipients((r) => (v && r.includes(v) ? r : [...r, v]));
  const removeRecipient = (i) => setRecipients((r) => r.filter((_, j) => j !== i));

  // Insère une balise (ex. [nom du client]) à la position du curseur.
  function insertToken(token) {
    const el = messageRef.current;
    if (!el) { setMessage((m) => m + token); return; }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    setMessage(message.slice(0, start) + token + message.slice(end));
    requestAnimationFrame(() => { el.focus(); const p = start + token.length; el.setSelectionRange(p, p); });
  }

  const subject = `Audit énergétique ${project?.project_name || ""}`;
  const toStr = recipients.map((s) => (s || "").trim()).filter(Boolean).join(", ");

  async function persist({ reminder }) {
    const recips = recipients.map((s) => (s || "").trim()).filter(Boolean);
    if (recips.length === 0) { alert("Ajoutez au moins un email destinataire."); return null; }
    setSaving(true);
    try {
      if (existing) {
        const body = { client_email: recips.join(", "), message: resolveTokens(message, project) };
        if (reminder) body.last_reminded_at = new Date().toISOString().slice(0, 10);
        const res = await apiFetch(`/client-requests/${existing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        return await res.json();
      } else {
        const payload = {
          project_id: projectId,
          client_email: recips.join(", "),
          message: resolveTokens(message, project),
          status: "sent",
          sent_at: new Date().toISOString().slice(0, 10),
          documents: [],
          feedback: "",
          received_files: [],
        };
        const res = await apiFetch(`/client-requests`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        return await res.json();
      }
    } catch {
      alert("Erreur lors de l'enregistrement de la demande.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function handleSendVia() {
    persist({ reminder: !!existing }).then((saved) => {
      if (saved) { onSaved?.(saved); onClose(); }
    });
  }
  async function handleSaveOnly() {
    const saved = await persist({ reminder: false });
    if (saved) { onSaved?.(saved); onClose(); }
  }

  const chip = { border: "1px solid #c4b5fd", background: "#f5f3ff", color: "#59169c",
    borderRadius: 999, padding: "4px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 4 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(700px, 100%)", background: "white",
        borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#111827" }}>
            {existing ? "Renvoyer un rappel" : "Nouvelle demande client"}
          </h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Destinataires */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Emails du contact client</span>
            {recipients.map((em, i) => (
              <div key={i} style={{ display: "flex", gap: 8 }}>
                <input type="email" list="crm-emails" value={em} onChange={(e) => setRecipient(i, e.target.value)}
                  placeholder="client@exemple.be" style={{ ...inputStyle, flex: 1 }} />
                {recipients.length > 1 && (
                  <button type="button" onClick={() => removeRecipient(i)} title="Retirer"
                    style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "10px",
                      cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <datalist id="crm-emails">
              {availableEmails.map((e) => <option key={e} value={e} />)}
            </datalist>
            {availableEmails.filter((e) => !recipients.includes(e)).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {availableEmails.filter((e) => !recipients.includes(e)).map((e) => (
                  <button key={e} type="button" onClick={() => addRecipient(e)} style={chip}><Plus size={12} /> {e}</button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => addRecipient("")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10,
                border: "1px dashed #d1d5db", background: "transparent", cursor: "pointer", color: "#6b7280",
                fontWeight: 600, fontSize: 13, width: "fit-content", marginTop: 2 }}>
              <Plus size={14} /> Ajouter un email
            </button>
          </div>

          {/* Email (un seul champ éditable = ce qui sera envoyé) */}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Email</span>
            <textarea ref={messageRef} value={message} onChange={(e) => setMessage(e.target.value)}
              rows={10} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Insérer :</span>
              <button type="button" style={chip} onClick={() => insertToken(project?.client_name || "")}>
                <Plus size={12} /> nom du client
              </button>
              <button type="button" style={chip} onClick={() => insertToken(project?.project_name || "")}>
                <Plus size={12} /> nom de l'audit
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", marginTop: 4 }}>
            <button type="button" onClick={handleSaveOnly} disabled={saving} style={{ ...btnSecondary, opacity: saving ? 0.6 : 1 }}>
              Enregistrer sans envoyer
            </button>
            <SendViaMenu
              to={toStr}
              subject={subject}
              body={resolveTokens(message, project)}
              disabled={saving || !toStr}
              label={existing ? "Renvoyer le rappel" : "Envoyer la demande"}
              onSend={handleSendVia}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
