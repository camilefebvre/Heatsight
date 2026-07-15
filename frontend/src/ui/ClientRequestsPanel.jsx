import { useEffect, useRef, useState } from "react";
import { Eye, Trash2, Paperclip, Send } from "lucide-react";
import { apiFetch } from "../api";
import ClientRequestModal from "./ClientRequestModal";

const DOC_TYPE_OPTIONS = [
  { value: "facture_electricite", label: "Factures électricité" },
  { value: "facture_gaz",         label: "Factures gaz" },
  { value: "facture_fuel",        label: "Factures fuel" },
  { value: "releve_compteur",     label: "Relevés de compteur" },
  { value: "contrat",             label: "Contrats énergie" },
  { value: "plans_batiment",      label: "Plans du bâtiment" },
  { value: "donnees_techniques",  label: "Données techniques" },
  { value: "rapport_existant",    label: "Rapport d'audit" },
  { value: "autre",               label: "Autre" },
];

// Statut auto-dérivé de l'avancement des documents reçus.
function deriveStatus(req) {
  const docs = req.documents || [];
  // Email libre (sans documents à suivre) → simplement "Envoyé".
  if (docs.length === 0) return { label: "Envoyé", bg: "#6b7280" };
  const received = docs.filter((d) => d.received).length;
  if (received === 0) return { label: "En attente", bg: "#fe9300" };
  if (received < docs.length) return { label: "Partiel", bg: "#82137e" };
  return { label: "Complète", bg: "#059669" };
}

function StatusBadge({ req }) {
  const s = deriveStatus(req);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px",
      borderRadius: 999, fontWeight: 700, fontSize: 12, background: s.bg,
      color: "white", letterSpacing: "0.02em", userSelect: "none" }}>
      {s.label}
    </span>
  );
}

function Modal({ open, onClose, title, children, width = 640 }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 16, zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: `min(${width}px, 100%)`,
        background: "white", borderRadius: 16, padding: 24,
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#111827" }}>{title}</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent",
            fontSize: 20, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
  fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none",
};
const btnPrimary = {
  background: "#59169c", color: "white", border: "none",
  padding: "11px 18px", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14,
};

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Panneau des demandes client, scopé à un projet ──────────────────────────
export default function ClientRequestsPanel({ projectId, project }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");

  // Modal de composition (création OU renvoi de rappel)
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeReq, setComposeReq] = useState(null); // null = nouvelle demande, sinon = renvoi

  // Import fichier client
  const [importFile, setImportFile] = useState(null);
  const [importDocType, setImportDocType] = useState("autre");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importInputKey, setImportInputKey] = useState(0);
  const importInputRef = useRef(null);

  const detailReq = requests.find((r) => r.id === detailId) || null;

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await apiFetch(`/client-requests?project_id=${projectId}`);
      const data = await res.json().catch(() => []);
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (detailReq) setFeedbackDraft(detailReq.feedback || "");
    setImportFile(null);
    setImportDocType("autre");
    setImportMsg("");
    setImportInputKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  function openNew() { setComposeReq(null); setComposeOpen(true); }
  function openResend(req) { setComposeReq(req); setComposeOpen(true); }

  function handleSaved() {
    setComposeOpen(false);
    setComposeReq(null);
    loadRequests();
  }

  async function handleImportFile(reqId) {
    if (!importFile) return;
    setImporting(true);
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("doc_type", importDocType);
      const res = await apiFetch(`/client-requests/${reqId}/import-file`, { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Erreur ${res.status}`);
      }
      await loadRequests();
      setImportFile(null);
      setImportDocType("autre");
      setImportInputKey((k) => k + 1);
      setImportMsg("✅ Fichier importé dans l'onglet Fichiers.");
    } catch (e) {
      setImportMsg(`❌ ${e.message}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer cette demande ?")) return;
    try {
      await apiFetch(`/client-requests/${id}`, { method: "DELETE" });
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (detailId === id) setDetailId(null);
    } catch {
      alert("Erreur lors de la suppression.");
    }
  }

  async function toggleDocReceived(reqId, docId) {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    const newDocs = req.documents.map((d) => (d.id === docId ? { ...d, received: !d.received } : d));
    try {
      const res = await apiFetch(`/client-requests/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: newDocs }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === reqId ? updated : r)));
    } catch {
      alert("Erreur lors de la mise à jour.");
    }
  }

  async function saveFeedback(reqId) {
    try {
      const res = await apiFetch(`/client-requests/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackDraft }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === reqId ? updated : r)));
    } catch {
      alert("Erreur lors de la sauvegarde du feedback.");
    }
  }

  const resendBtn = {
    display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10,
    border: "1px solid #c4b5fd", background: "#f5f3ff", cursor: "pointer",
    fontWeight: 600, fontSize: 13, color: "#59169c",
  };

  return (
    <div>
      {/* Barre : description + bouton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ color: "#6b7280", fontSize: 14 }}>
          Demandez des documents au client et suivez leur avancement pour ce projet.
        </div>
        <button onClick={openNew} style={btnPrimary}>+ Nouvelle demande</button>
      </div>

      {/* Tableau */}
      <div style={{ background: "white", borderRadius: 16, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
        {loading ? (
          <div style={{ color: "#6b7280", padding: "24px 0" }}>Chargement…</div>
        ) : requests.length === 0 ? (
          <div style={{ color: "#6b7280", padding: "24px 0" }}>
            Aucune demande pour ce projet. Cliquez sur <b>+ Nouvelle demande</b> pour commencer.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12,
                background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                {["Contact client", "Statut", "Envoi / dernier rappel", "Actions"].map((col) => (
                  <th key={col} style={{ padding: "10px 12px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: "12px 12px", color: "#374151", fontWeight: 600 }}>{req.client_email}</td>
                  <td style={{ padding: "12px 12px" }}><StatusBadge req={req} /></td>
                  <td style={{ padding: "12px 12px", color: "#6b7280", fontSize: 13 }}>
                    <div>Envoyé le {formatDate(req.sent_at)}</div>
                    {req.last_reminded_at && (
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                        Relancé le {formatDate(req.last_reminded_at)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => setDetailId(req.id)} title="Voir détails"
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10,
                          border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#374151" }}>
                        <Eye size={14} /> Détails
                      </button>
                      <button onClick={() => openResend(req)} title="Renvoyer un rappel" style={resendBtn}>
                        <Send size={14} /> Rappel
                      </button>
                      <button onClick={() => handleDelete(req.id)} title="Supprimer"
                        style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderRadius: 10,
                          border: "1px solid #fecaca", background: "#fff1f1", cursor: "pointer", color: "#ca2946" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de composition (création / renvoi) */}
      <ClientRequestModal
        open={composeOpen}
        onClose={() => { setComposeOpen(false); setComposeReq(null); }}
        project={project}
        projectId={projectId}
        existing={composeReq}
        onSaved={handleSaved}
      />

      {/* Modal : Détails */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)}
        title={detailReq ? `Demande - ${project?.project_name || ""}` : "Détails"} width={660}>
        {detailReq && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>Contact client</div>
                <div style={{ fontWeight: 600, color: "#111827" }}>{detailReq.client_email}</div>
              </div>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>Statut</div>
                <StatusBadge req={detailReq} />
                {detailReq.last_reminded_at && (
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
                    Dernier rappel le {formatDate(detailReq.last_reminded_at)}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setDetailId(null); openResend(detailReq); }} style={resendBtn}>
                <Send size={14} /> Renvoyer un rappel
              </button>
            </div>

            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>Message envoyé</div>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px",
                fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {detailReq.message}
              </div>
            </div>

            {(detailReq.documents || []).length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>Documents demandés</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(detailReq.documents || []).map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 12, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10,
                    background: doc.received ? "#f3f4f6" : "white" }}>
                    <span style={{ fontSize: 14, color: "#374151" }}>{doc.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700,
                        color: doc.received ? "#6b7280" : "#fe9300",
                        background: doc.received ? "#f3f4f6" : "#fff7ed",
                        padding: "3px 10px", borderRadius: 999 }}>
                        {doc.received ? "Reçu" : "En attente"}
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                        fontSize: 12, color: "#6b7280", userSelect: "none" }}>
                        <input type="checkbox" checked={doc.received}
                          onChange={() => toggleDocReceived(detailReq.id, doc.id)} style={{ cursor: "pointer" }} />
                        Marquer reçu
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>Fichiers reçus du client</div>

              {(detailReq.received_files || []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {detailReq.received_files.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                      borderRadius: 10, border: "1px solid #e5e7eb",
                      background: f.project_doc_id ? "#f3f4f6" : "#f9fafb" }}>
                      <Paperclip size={14} style={{ color: "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: "#374151", fontWeight: 600, flex: 1, minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      {f.project_doc_id ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", background: "#f3f4f6",
                          padding: "2px 8px", borderRadius: 99, flexShrink: 0 }}>✓ Dans Fichiers</span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>{f.size}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
                  letterSpacing: "0.04em", marginBottom: 12 }}>
                  Importer dans les fichiers du projet
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <label style={{ display: "grid", gap: 5 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Catégorie</span>
                    <select value={importDocType} onChange={(e) => setImportDocType(e.target.value)}
                      style={{ ...inputStyle, fontSize: 13, minWidth: 180 }}>
                      {DOC_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 5, flex: 1, minWidth: 160 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Fichier (PDF, JPG, PNG)</span>
                    <label style={{ background: "white", color: importFile ? "#374151" : "#9ca3af",
                      border: "1px solid #e5e7eb", borderRadius: 12, fontWeight: 600, fontSize: 13, padding: "9px 12px",
                      cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                      <input key={importInputKey} ref={importInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                        style={{ display: "none" }}
                        onChange={(e) => { setImportFile(e.target.files[0] || null); setImportMsg(""); }} />
                      {importFile ? `📎 ${importFile.name}` : "Choisir un fichier…"}
                    </label>
                  </label>
                  <button type="button"
                    style={{ ...btnPrimary, fontSize: 13, padding: "9px 16px",
                      opacity: (!importFile || importing) ? 0.6 : 1, alignSelf: "flex-end" }}
                    disabled={!importFile || importing}
                    onClick={() => handleImportFile(detailReq.id)}>
                    {importing ? "Import…" : "Importer →"}
                  </button>
                </div>
                {importMsg && (
                  <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700,
                    color: importMsg.startsWith("✅") ? "#374151" : "#8f1d2f" }}>
                    {importMsg}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>Commentaire / Feedback client</div>
              <textarea value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)}
                rows={3} placeholder="Ajoutez un commentaire à envoyer au client…"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14,
                  width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none", resize: "vertical" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => saveFeedback(detailReq.id)} style={btnPrimary}>Enregistrer le commentaire</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
