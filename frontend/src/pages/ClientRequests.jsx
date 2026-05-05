import { useEffect, useRef, useState } from "react";
import { useProject } from "../state/ProjectContext";
import { Eye, Trash2, Plus, X, Paperclip } from "lucide-react";
import { apiFetch } from "../api";

// ─── Types de documents (checklist AMUREBA) ───────────────────────────────────
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

// ─── Config statuts ───────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:   { label: "Brouillon",  bg: "#64748b" },
  sent:    { label: "Envoyé",     bg: "#2563eb" },
  opened:  { label: "Ouvert",     bg: "#ea580c" },
  replied: { label: "Répondu",    bg: "#16a34a" },
  late:    { label: "En retard",  bg: "#dc2626" },
};

// ─── Composants utilitaires ───────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
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

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ClientRequests() {
  const { selectedProjectId } = useProject();

  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");

  // ── Import fichier client ───────────────────────────────────────────────────
  const [importFile, setImportFile] = useState(null);
  const [importDocType, setImportDocType] = useState("autre");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importInputKey, setImportInputKey] = useState(0); // reset file input
  const importInputRef = useRef(null);

  const emptyForm = {
    project_id: "",
    client_email: "",
    message: "Bonjour,\n\nDans le cadre de l'audit énergétique, merci de nous transmettre les documents listés ci-dessous.",
    documents: [{ id: "new-d0", label: "" }],
  };
  const [form, setForm] = useState(emptyForm);

  const detailReq = requests.find((r) => r.id === detailId) || null;

  // ── Chargement initial ─────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiFetch(`/client-requests`).then((r) => r.json()).catch(() => []),
      apiFetch(`/projects`).then((r) => r.json()).catch(() => []),
    ]).then(([reqs, projs]) => {
      setRequests(Array.isArray(reqs) ? reqs : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (detailReq) setFeedbackDraft(detailReq.feedback || "");
    // Reset import form when switching requests
    setImportFile(null);
    setImportDocType("autre");
    setImportMsg("");
    setImportInputKey((k) => k + 1);
  }, [detailId]);

  // ── Importer un fichier reçu dans les documents projet ─────────────────────
  async function handleImportFile(reqId) {
    if (!importFile) return;
    setImporting(true);
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("doc_type", importDocType);
      const res = await apiFetch(`/client-requests/${reqId}/import-file`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Erreur ${res.status}`);
      }
      // Refresh list to get updated received_files
      const refresh = await apiFetch(`/client-requests`);
      if (refresh.ok) setRequests(await refresh.json());
      setImportFile(null);
      setImportDocType("autre");
      setImportInputKey((k) => k + 1);
      setImportMsg("✅ Fichier importé dans le module Documents.");
    } catch (e) {
      setImportMsg(`❌ ${e.message}`);
    } finally {
      setImporting(false);
    }
  }

  function projectName(project_id) {
    return projects.find((p) => p.id === project_id)?.project_name || project_id || "—";
  }

  // ── Créer une demande ──────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    const docs = form.documents.filter((d) => d.label.trim() !== "");
    if (docs.length === 0) {
      alert("Ajoutez au moins un document demandé.");
      return;
    }

    const payload = {
      project_id:   form.project_id || null,
      client_email: form.client_email,
      message:      form.message,
      status:       "sent",
      sent_at:      new Date().toISOString().slice(0, 10),
      documents:    docs.map((d, i) => ({ id: `d-${Date.now()}-${i}`, label: d.label, received: false })),
      feedback:     "",
      received_files: [],
    };

    try {
      const res = await apiFetch(`/client-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setRequests((prev) => [created, ...prev]);
      setCreateOpen(false);
      setForm(emptyForm);
    } catch {
      alert("Erreur lors de la création de la demande.");
    }
  }

  // ── Supprimer ──────────────────────────────────────────────────────────────
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

  // ── Cocher un document reçu ────────────────────────────────────────────────
  async function toggleDocReceived(reqId, docId) {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;

    const newDocs = req.documents.map((d) =>
      d.id === docId ? { ...d, received: !d.received } : d
    );

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

  // ── Sauvegarder le feedback ────────────────────────────────────────────────
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

  // ── Helpers formulaire ────────────────────────────────────────────────────
  function updateDoc(idx, value) {
    setForm((prev) => {
      const docs = [...prev.documents];
      docs[idx] = { ...docs[idx], label: value };
      return { ...prev, documents: docs };
    });
  }

  function addDoc() {
    setForm((prev) => ({
      ...prev,
      documents: [...prev.documents, { id: `new-d-${Date.now()}`, label: "" }],
    }));
  }

  function removeDoc(idx) {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== idx),
    }));
  }

  // ─── Styles ────────────────────────────────────────────────────────────────
  const inputStyle = {
    padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
    fontSize: 14, width: "100%", boxSizing: "border-box",
    fontFamily: "inherit", outline: "none",
  };

  const btnPrimary = {
    background: "#6d28d9", color: "white", border: "none",
    padding: "11px 18px", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14,
  };

  const btnSecondary = {
    background: "white", color: "#374151", border: "1px solid #e5e7eb",
    padding: "11px 16px", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 14,
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Collecte de données</div>
          <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
            Requêtes client
          </h1>
          <div style={{ color: "#6b7280" }}>
            Envoyez des demandes de documents à vos clients et suivez leur avancement.
          </div>
        </div>
        <button onClick={() => {
          const proj = projects.find((p) => p.id === selectedProjectId);
          setForm({ ...emptyForm, project_id: proj?.id || "" });
          setCreateOpen(true);
        }} style={btnPrimary}>
          + Nouvelle demande
        </button>
      </div>

      {/* ── Tableau ──────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 18, background: "white", borderRadius: 16,
        padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
        {loading ? (
          <div style={{ color: "#6b7280", padding: "24px 0" }}>Chargement…</div>
        ) : requests.length === 0 ? (
          <div style={{ color: "#6b7280", padding: "24px 0" }}>
            Aucune demande. Cliquez sur <b>+ Nouvelle demande</b> pour commencer.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12,
                background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                {["Projet", "Contact client", "Statut", "Date d'envoi", "Actions"].map((col) => (
                  <th key={col} style={{ padding: "10px 12px", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: "12px 12px", fontWeight: 700, color: "#111827" }}>
                    {projectName(req.project_id)}
                  </td>
                  <td style={{ padding: "12px 12px", color: "#374151" }}>
                    {req.client_email}
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <StatusBadge status={req.status} />
                  </td>
                  <td style={{ padding: "12px 12px", color: "#6b7280", fontSize: 13 }}>
                    {req.sent_at
                      ? new Date(req.sent_at).toLocaleDateString("fr-BE", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setDetailId(req.id)} title="Voir détails"
                        style={{ display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
                          background: "white", cursor: "pointer", fontWeight: 600,
                          fontSize: 13, color: "#374151" }}>
                        <Eye size={14} /> Détails
                      </button>
                      <button onClick={() => handleDelete(req.id)} title="Supprimer"
                        style={{ display: "flex", alignItems: "center", padding: "7px 10px",
                          borderRadius: 10, border: "1px solid #fecaca",
                          background: "#fff1f1", cursor: "pointer", color: "#dc2626" }}>
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

      {/* ── Modal : Nouvelle demande ──────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}
        title="Nouvelle demande client" width={680}>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Projet */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>Projet</span>
            {projects.length > 0 ? (
              <select value={form.project_id}
                onChange={(e) => setForm((prev) => ({ ...prev, project_id: e.target.value }))}
                required style={inputStyle}>
                <option value="">Sélectionner un projet…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_name}</option>
                ))}
              </select>
            ) : (
              <input value={form.project_id}
                onChange={(e) => setForm((prev) => ({ ...prev, project_id: e.target.value }))}
                placeholder="ID du projet" required style={inputStyle} />
            )}
          </label>

          {/* Email client */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
              Email du contact client
            </span>
            <input type="email" value={form.client_email}
              onChange={(e) => setForm((prev) => ({ ...prev, client_email: e.target.value }))}
              placeholder="client@exemple.be" required style={inputStyle} />
          </label>

          {/* Message */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
              Message personnalisé
            </span>
            <textarea value={form.message}
              onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
              rows={4} style={{ ...inputStyle, resize: "vertical" }} />
          </label>

          {/* Documents demandés */}
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>
              Documents demandés
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.documents.map((doc, idx) => (
                <div key={doc.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={doc.label} onChange={(e) => updateDoc(idx, e.target.value)}
                    placeholder="Ex : Factures électricité 2023"
                    style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => removeDoc(idx)}
                    disabled={form.documents.length === 1}
                    style={{ border: "1px solid #e5e7eb", background: "white",
                      borderRadius: 10, padding: "10px",
                      cursor: form.documents.length === 1 ? "not-allowed" : "pointer",
                      color: form.documents.length === 1 ? "#d1d5db" : "#6b7280",
                      display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addDoc}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                  borderRadius: 10, border: "1px dashed #d1d5db", background: "transparent",
                  cursor: "pointer", color: "#6b7280", fontWeight: 600, fontSize: 13,
                  width: "fit-content" }}>
                <Plus size={14} /> Ajouter un document
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={() => setCreateOpen(false)} style={btnSecondary}>
              Annuler
            </button>
            <button type="submit" style={btnPrimary}>Envoyer la demande</button>
          </div>
        </form>
      </Modal>

      {/* ── Modal : Détails ───────────────────────────────────────────────────── */}
      <Modal open={!!detailId} onClose={() => setDetailId(null)}
        title={detailReq ? `Demande — ${projectName(detailReq.project_id)}` : "Détails"}
        width={660}>
        {detailReq && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Infos générales */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>
                  Contact client
                </div>
                <div style={{ fontWeight: 600, color: "#111827" }}>{detailReq.client_email}</div>
              </div>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>
                  Statut
                </div>
                <StatusBadge status={detailReq.status} />
              </div>
            </div>

            {/* Message envoyé */}
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>
                Message envoyé
              </div>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px",
                fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {detailReq.message}
              </div>
            </div>

            {/* Documents */}
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>
                Documents demandés
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(detailReq.documents || []).map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 12, padding: "10px 14px",
                    border: "1px solid #e5e7eb", borderRadius: 10,
                    background: doc.received ? "#f0fdf4" : "white" }}>
                    <span style={{ fontSize: 14, color: "#374151" }}>{doc.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700,
                        color: doc.received ? "#16a34a" : "#ea580c",
                        background: doc.received ? "#dcfce7" : "#fff7ed",
                        padding: "3px 10px", borderRadius: 999 }}>
                        {doc.received ? "Reçu" : "En attente"}
                      </span>
                      <label style={{ display: "flex", alignItems: "center", gap: 4,
                        cursor: "pointer", fontSize: 12, color: "#6b7280", userSelect: "none" }}>
                        <input type="checkbox" checked={doc.received}
                          onChange={() => toggleDocReceived(detailReq.id, doc.id)}
                          style={{ cursor: "pointer" }} />
                        Marquer reçu
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Importer un fichier reçu ────────────────────────────────── */}
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>
                Fichiers reçus du client
              </div>

              {/* List of already-imported files */}
              {(detailReq.received_files || []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {detailReq.received_files.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 14px", borderRadius: 10,
                      border: f.project_doc_id ? "1px solid #d1fae5" : "1px solid #e5e7eb",
                      background: f.project_doc_id ? "#f0fdf4" : "#f9fafb",
                    }}>
                      <Paperclip size={14} style={{ color: "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: "#374151", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      {f.project_doc_id ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", background: "#dcfce7", padding: "2px 8px", borderRadius: 99, flexShrink: 0 }}>
                          ✓ Dans Documents
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>{f.size}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Upload form */}
              {detailReq.project_id ? (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
                    Importer dans le module Documents
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    {/* Doc type */}
                    <label style={{ display: "grid", gap: 5 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Catégorie</span>
                      <select
                        value={importDocType}
                        onChange={(e) => setImportDocType(e.target.value)}
                        style={{ ...inputStyle, fontSize: 13, minWidth: 180 }}
                      >
                        {DOC_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>

                    {/* File picker */}
                    <label style={{ display: "grid", gap: 5, flex: 1, minWidth: 160 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Fichier (PDF, JPG, PNG)</span>
                      <label style={{
                        ...btnSecondary, fontSize: 13, padding: "9px 12px", cursor: "pointer",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
                        color: importFile ? "#374151" : "#9ca3af",
                      }}>
                        <input
                          key={importInputKey}
                          ref={importInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          style={{ display: "none" }}
                          onChange={(e) => { setImportFile(e.target.files[0] || null); setImportMsg(""); }}
                        />
                        {importFile ? `📎 ${importFile.name}` : "Choisir un fichier…"}
                      </label>
                    </label>

                    {/* Import button */}
                    <button
                      type="button"
                      style={{ ...btnPrimary, fontSize: 13, padding: "9px 16px", opacity: (!importFile || importing) ? 0.6 : 1, alignSelf: "flex-end" }}
                      disabled={!importFile || importing}
                      onClick={() => handleImportFile(detailReq.id)}
                    >
                      {importing ? "Import…" : "Importer →"}
                    </button>
                  </div>

                  {importMsg && (
                    <div style={{
                      marginTop: 10, fontSize: 13, fontWeight: 700,
                      color: importMsg.startsWith("✅") ? "#065f46" : "#991b1b",
                    }}>
                      {importMsg}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>
                  Associez cette demande à un projet pour importer des fichiers.
                </div>
              )}
            </div>

            {/* Feedback */}
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>
                Commentaire / Feedback client
              </div>
              <textarea value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)}
                rows={3} placeholder="Ajoutez un commentaire à envoyer au client…"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
                  fontSize: 14, width: "100%", boxSizing: "border-box",
                  fontFamily: "inherit", outline: "none", resize: "vertical" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => saveFeedback(detailReq.id)} style={btnPrimary}>
                  Enregistrer le commentaire
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
