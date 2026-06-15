import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Download, Upload, Sparkles, RefreshCw,
  Clock, X, CheckSquare, Square, AlertTriangle, FileCheck,
} from "lucide-react";
import { useProject } from "../state/ProjectContext";
import { apiFetch } from "../api";
import TemplateLibraryPanel from "../ui/TemplateLibraryPanel";

/* ── Conflict type metadata ──────────────────────────────────── */
const CONFLICT_META = {
  new:      { label: "Champ vide",               color: "#059669", bg: "#d1fae5", title: "Ce champ est actuellement vide dans le rapport" },
  replace:  { label: "Remplace valeur existante", color: "#b45309", bg: "#fef3c7", title: "Remplacera une valeur déjà présente" },
  uncertain:{ label: "Estimation sans source",    color: "#6b7280", bg: "#f3f4f6", title: "Valeur estimée par l'IA, sans document source" },
  applied:  { label: "Déjà appliquée",            color: "#0369a1", bg: "#e0f2fe", title: "Cette valeur est déjà dans le rapport courant" },
};

const FILTER_OPTIONS = [
  { id: "todo",      label: "À traiter",       count: (items) => items.filter(i => i.conflict_type !== "applied").length },
  { id: "new",       label: "Nouvelles",       count: (items) => items.filter(i => i.conflict_type === "new").length },
  { id: "replace",   label: "Remplacements",   count: (items) => items.filter(i => i.conflict_type === "replace").length },
  { id: "uncertain", label: "Estimations",     count: (items) => items.filter(i => i.conflict_type === "uncertain").length },
  { id: "applied",   label: "Déjà appliquées", count: (items) => items.filter(i => i.conflict_type === "applied").length },
  { id: "all",       label: "Toutes",          count: (items) => items.length },
];

function filterItems(items, filterId) {
  if (filterId === "todo") return items.filter(i => i.conflict_type !== "applied");
  if (filterId === "all")  return items;
  return items.filter(i => i.conflict_type === filterId);
}

/* ── Section metadata ────────────────────────────────────────── */
const SECTION_META = {
  page_de_garde:        { label: "Page de garde",          icon: "📋" },
  description_batiment: { label: "Description du bâtiment", icon: "🏢" },
  synthese_energetique: { label: "Situation énergétique",   icon: "⚡" },
  plan_amelioration:    { label: "Plan d'amélioration",     icon: "🔧" },
};

/* ── Source labels for history ───────────────────────────────── */
const SOURCE_LABELS = {
  ai_prefill:    "Pré-rempli par IA",
  manual_upload: "Upload manuel",
};

/* ── Helpers ─────────────────────────────────────────────────── */
function truncateMid(name, maxLen = 26) {
  if (!name || name.length <= maxLen) return name || "";
  const dotIdx = name.lastIndexOf(".");
  const ext  = dotIdx > 0 ? name.slice(dotIdx) : "";
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const available = maxLen - ext.length - 1;
  const headLen = Math.ceil(available * 0.6);
  const tailLen = available - headLen;
  return base.slice(0, headLen) + "…" + base.slice(-tailLen) + ext;
}

const DB_SOURCE_LABELS = {
  energy_accounting_db:    { icon: "📊", label: "Comptabilité énergétique" },
  improvement_actions_db:  { icon: "📋", label: "Plan d'amélioration" },
  audit_data_db:           { icon: "📝", label: "Audit" },
};

const spin = { animation: "spin 1s linear infinite" };

function _safeName(project) {
  return (project?.project_name || "rapport")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_").replace(/[^\w-]/g, "");
}

function _triggerDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

/* Build flat items array from sections response */
function buildItems(sections) {
  const items = [];
  (sections || []).forEach((sec) => {
    (sec.fields || []).forEach((f) => {
      items.push({
        id:             `${sec.id}__${f.field}`,
        section:        sec.id,
        field:          f.field,
        label:          f.label,
        proposed_value: f.proposed_value || "",
        current_value:  f.current_value || null,
        source:         f.source || null,
        conflict_type:  f.conflict_type || "new",
        selected:       f.conflict_type !== "replace" && f.conflict_type !== "applied",
        value:          f.proposed_value || "",
      });
    });
  });
  return items;
}

/* ═══════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════ */
export default function ProjectReport() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();
  const uploadRef = useRef(null);

  useEffect(() => { setSelectedProjectId(projectId); }, [projectId]);

  const [project,        setProject]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [reportStatus,   setReportStatus]   = useState(null);
  const [prefillDisabled, setPrefillDisabled] = useState(false);

  const [proposalData,   setProposalData]   = useState(null); // { sections, has_existing_docx, ... }
  const [items,          setItems]          = useState([]);   // flat list of checkable items

  const [analyzing,         setAnalyzing]         = useState(false);
  const [applying,          setApplying]          = useState(false);
  const [uploading,         setUploading]         = useState(false);
  const [downloadingCurrent, setDownloadingCurrent] = useState(false);
  const [uploadFile,     setUploadFile]     = useState(null);
  const [uploadMsg,      setUploadMsg]      = useState("");

  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [analyzeError,   setAnalyzeError]   = useState("");
  const [applyError,     setApplyError]     = useState("");
  const [pageError,      setPageError]      = useState("");

  /* ── Load ──────────────────────────────────────────────────── */
  async function loadAll() {
    setLoading(true);
    setPageError("");
    try {
      const [resProjects, resStatus] = await Promise.all([
        apiFetch("/projects").catch(() => null),
        apiFetch(`/projects/${projectId}/report/status`).catch(() => null),
      ]);
      const list = resProjects?.ok ? await resProjects.json().catch(() => []) : [];
      setProject(list.find((x) => String(x.id) === String(projectId)) || null);
      setReportStatus(resStatus?.ok ? await resStatus.json().catch(() => null) : null);
    } catch (e) {
      setPageError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [projectId]);

  /* ── History ───────────────────────────────────────────────── */
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/report/history`);
      if (res.ok) setHistory(await res.json());
    } catch (_) {}
    finally { setHistoryLoading(false); }
  }

  function openHistory() {
    setHistoryOpen(true);
    loadHistory();
  }

  /* ── Analyze ───────────────────────────────────────────────── */
  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError("");
    setApplyError("");
    setProposalData(null);
    setItems([]);
    try {
      let res;
      try {
        res = await apiFetch(`/projects/${projectId}/report/prefill-preview`, { method: "POST" });
      } catch (networkErr) {
        // fetch() throws TypeError when server is unreachable / connection dropped
        throw new Error(
          "Impossible de joindre le serveur. Vérifiez que le backend est démarré (uvicorn). Détail : " +
          networkErr.message
        );
      }
      if (!res.ok) {
        let detail = `Erreur serveur (${res.status})`;
        try {
          const body = await res.json();
          detail = body?.detail || detail;
        } catch (_) {}
        throw new Error(detail);
      }
      const data = await res.json();
      setProposalData(data);
      setItems(buildItems(data.sections));
    } catch (e) {
      setAnalyzeError(e.message || "Erreur lors de l'analyse IA");
    } finally {
      setAnalyzing(false);
    }
  }

  /* ── Checklist toggle ──────────────────────────────────────── */
  const toggleItem = (id) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it)));

  const toggleAll = (val) =>
    setItems((prev) => prev.map((it) => ({ ...it, selected: val })));

  /* ── Apply ─────────────────────────────────────────────────── */
  async function handleApply() {
    setApplying(true);
    setApplyError("");
    try {
      const selectedItems = items.filter((i) => i.selected);
      const res = await apiFetch(`/projects/${projectId}/report/apply-prefill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedItems }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Erreur serveur (${res.status})`);
      }
      _triggerDownload(await res.blob(), `${_safeName(project)}_rapport.docx`);
      await loadAll();
      setItems([]);
      setProposalData(null);
      if (historyOpen) loadHistory();
    } catch (e) {
      setApplyError(e.message || "Erreur lors de l'application");
    } finally {
      setApplying(false);
    }
  }

  /* ── Upload ────────────────────────────────────────────────── */
  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadMsg("");
    setPageError("");
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      const res = await apiFetch(`/projects/${projectId}/report/upload-docx`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Erreur serveur (${res.status})`);
      }
      setUploadFile(null);
      if (uploadRef.current) uploadRef.current.value = "";
      setUploadMsg("Fichier importé avec succès.");
      await loadAll();
      if (historyOpen) loadHistory();
    } catch (e) {
      setPageError(e.message || "Erreur lors de l'import");
    } finally {
      setUploading(false);
    }
  }

  /* ── Download current docx ─────────────────────────────────── */
  async function handleDownloadCurrent() {
    setDownloadingCurrent(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/report/docx`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      _triggerDownload(await res.blob(), `${_safeName(project)}_rapport.docx`);
    } catch (e) {
      setPageError(e.message || "Erreur lors du téléchargement");
    } finally {
      setDownloadingCurrent(false);
    }
  }

  /* ── Render ────────────────────────────────────────────────── */
  if (loading) return <div style={{ color: "#6b7280" }}>Chargement…</div>;
  if (!project) return <div style={{ color: "#6b7280" }}>Projet introuvable.</div>;

  const hasDocx    = reportStatus?.has_report_docx;
  const docxSource = reportStatus?.report_docx_source;
  const prefillAt  = reportStatus?.report_prefilled_at;
  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <div style={{ maxWidth: 1400, width: "100%" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ color: "#6b7280", fontSize: 14 }}>
          Pré-remplissez toutes les sections du rapport Word avec l'IA, puis téléchargez le fichier.
        </div>
        <button
          onClick={openHistory}
          style={{ ...s.ghostBtn, fontSize: 12, padding: "8px 14px", marginTop: 8, whiteSpace: "nowrap" }}
        >
          <Clock size={13} />
          Historique
        </button>
      </div>

      {/* ── Deux zones : rapport courant (gauche) + modèles (droite) ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>

      {/* ── Docx status banner ─────────────────────────────────── */}
      <div style={{
        marginBottom: 12, padding: "12px 16px",
        background: hasDocx ? "#f3f4f6" : "#f9fafb",
        border: `1px solid ${hasDocx ? "#e5e7eb" : "#e5e7eb"}`,
        borderRadius: 10, fontSize: 13,
        color: hasDocx ? "#374151" : "#6b7280",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        {hasDocx ? (
          <>
            <span style={{ fontWeight: 700 }}>Rapport Word disponible</span>
            <span style={{ opacity: 0.7 }}>—</span>
            <span>{SOURCE_LABELS[docxSource] || docxSource}</span>
            {prefillAt && (
              <span style={{ opacity: 0.6, fontSize: 12 }}>
                {new Date(prefillAt).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
            <button
              onClick={handleDownloadCurrent}
              disabled={downloadingCurrent}
              style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#374151",
                cursor: downloadingCurrent ? "default" : "pointer",
              }}
            >
              <Download size={13} />
              {downloadingCurrent ? "Téléchargement…" : "Télécharger la version courante"}
            </button>
          </>
        ) : (
          <span>Aucun rapport Word disponible — lancez le pré-remplissage IA ou importez un fichier.</span>
        )}
      </div>

      {pageError && <div style={{ ...s.errorBox, marginBottom: 12 }}>{pageError}</div>}

      {/* ── AI Prefill card ─────────────────────────────────────── */}
      <div style={s.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: items.length > 0 ? 16 : 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>Pré-remplissage IA</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Claude analyse les données du projet (documents, compta énergie, actions AMUREBA) et propose des valeurs pour toutes les sections du rapport.
            </div>
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || applying || prefillDisabled}
            style={{ ...s.primaryBtn, flexShrink: 0, opacity: (analyzing || applying || prefillDisabled) ? 0.7 : 1, cursor: prefillDisabled ? "not-allowed" : "pointer" }}
          >
            {analyzing
              ? <><RefreshCw size={14} style={spin} /> Analyse…</>
              : <><Sparkles size={14} /> Analyser avec l'IA</>}
          </button>
        </div>

        {prefillDisabled && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", lineHeight: 1.5 }}>
            Pré-remplissage IA indisponible avec un modèle personnalisé — mode manuel
            (télécharger l'officiel → compléter dans Word → réimporter).
          </div>
        )}

        {analyzeError && <div style={{ ...s.errorBox, marginTop: 12 }}>{analyzeError}</div>}

        {/* ── Checklist groupée par section ─────────────────────── */}
        {items.length > 0 && (
          <ChecklistPanel
            items={items}
            proposalData={proposalData}
            applying={applying}
            selectedCount={selectedCount}
            onToggle={toggleItem}
            onToggleAll={toggleAll}
            onApply={handleApply}
            onClose={() => { setItems([]); setProposalData(null); }}
            error={applyError}
          />
        )}
      </div>

      {/* ── Upload section ─────────────────────────────────────── */}
      <div style={{ ...s.infoCard, marginTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#374151", marginBottom: 6 }}>
          Importer un rapport Word modifié
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.6 }}>
          Le fichier importé deviendra la nouvelle base pour les prochains pré-remplissages IA. Une ligne d'historique sera créée.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={uploadRef}
            type="file"
            accept=".docx"
            onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadMsg(""); }}
            style={{ fontSize: 13 }}
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
            style={{
              background: uploadFile ? "#59169c" : "#e5e7eb",
              color: uploadFile ? "white" : "#9ca3af",
              border: "none", padding: "8px 14px", borderRadius: 10,
              fontWeight: 700, cursor: uploadFile ? "pointer" : "default",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {uploading
              ? <><RefreshCw size={14} style={spin} /> Import…</>
              : <><Upload size={14} /> Importer</>}
          </button>
          {uploadMsg && <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{uploadMsg}</span>}
        </div>
      </div>

        </div>{/* fin ZONE PRINCIPALE */}

        {/* PANNEAU DROITE — bibliothèque de modèles */}
        <div style={{ flex: "1 1 320px", maxWidth: 380 }}>
          <TemplateLibraryPanel
            type="report"
            projectId={projectId}
            activeTemplateId={project.active_report_template_id}
            onActiveChange={(id) => setProject((p) => (p ? { ...p, active_report_template_id: id } : p))}
            onCapabilityChange={(supportsPrefill) => setPrefillDisabled(!supportsPrefill)}
          />
        </div>

      </div>{/* fin deux zones */}

      {/* ── History drawer ──────────────────────────────────────── */}
      {historyOpen && (
        <HistoryDrawer
          history={history}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
          projectId={projectId}
        />
      )}
    </div>
  );
}

/* ── Checklist panel ────────────────────────────────────────── */
function ChecklistPanel({ items, proposalData, applying, selectedCount, onToggle, onToggleAll, onApply, onClose, error }) {
  const allSelected = items.length > 0 && items.every((i) => i.selected);
  const totalReplaces = items.filter((i) => i.conflict_type === "replace").length;

  const [activeFilter, setActiveFilter] = useState("todo");

  const visibleItems = filterItems(items, activeFilter);
  const sectionIds = [...new Set(visibleItems.map((i) => i.section))];

  const [expanded, setExpanded] = useState(() =>
    Object.fromEntries([...new Set(items.map((i) => i.section))].map((id, idx) => [id, idx === 0]))
  );
  const allExpanded = sectionIds.every((id) => expanded[id]);

  const toggleSection = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleAllSections = () =>
    setExpanded(Object.fromEntries(sectionIds.map((id) => [id, !allExpanded])));

  return (
    <div style={{ border: "1.5px solid #ede9fe", borderRadius: 14, overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        background: "#f5f3ff", padding: "12px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#4c1d95" }}>Propositions IA</div>
          <div style={{ fontSize: 12, color: "#59169c", marginTop: 2 }}>
            {selectedCount} champ{selectedCount !== 1 ? "s" : ""} sélectionné{selectedCount !== 1 ? "s" : ""}
            {totalReplaces > 0 && (
              <span style={{ marginLeft: 8, color: CONFLICT_META.replace.color, fontWeight: 700 }}>
                · ⚠ {totalReplaces} remplacement{totalReplaces !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={toggleAllSections} style={{ ...s.ghostBtn, fontSize: 11, padding: "5px 10px" }}>
            {allExpanded ? "▲ Tout replier" : "▼ Tout ouvrir"}
          </button>
          <button onClick={() => onToggleAll(!allSelected)} style={{ ...s.ghostBtn, fontSize: 11, padding: "5px 10px" }}>
            {allSelected ? <><Square size={12} /> Tout décocher</> : <><CheckSquare size={12} /> Tout cocher</>}
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "2px 6px", borderRadius: 6 }}
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Barre de filtre ──────────────────────────────── */}
      <div style={{ padding: "8px 18px", borderBottom: "1px solid #ede9fe", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTER_OPTIONS.map(opt => {
          const cnt = opt.count(items);
          const isActive = activeFilter === opt.id;
          return (
            <button key={opt.id} onClick={() => setActiveFilter(opt.id)} style={{
              fontSize: 11, fontWeight: isActive ? 700 : 500, borderRadius: 999,
              padding: "3px 10px", cursor: "pointer",
              background: isActive ? "#59169c" : "#f3f4f6",
              color: isActive ? "white" : "#374151",
              border: isActive ? "none" : "1px solid #e5e7eb",
            }}>
              {opt.label} {cnt > 0 && <span style={{ opacity: 0.7 }}>({cnt})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Légende fixe ─────────────────────────────────── */}
      <div style={{ padding: "6px 18px", background: "#fafafa", borderBottom: "1px solid #ede9fe", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Légende :</span>
        {Object.entries(CONFLICT_META).map(([type, m]) => (
          <span key={type} title={m.title} style={{
            fontSize: 10, fontWeight: 700, color: m.color, background: m.bg,
            padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", cursor: "help",
          }}>{m.label}</span>
        ))}
        {totalReplaces > 0 && (
          <span style={{ fontSize: 11, color: "#b45309", marginLeft: 4 }}>
            <AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> {totalReplaces} remplacement{totalReplaces > 1 ? "s" : ""} pré-décoché{totalReplaces > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Groups by section */}
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {sectionIds.map((secId) => {
          const secMeta = SECTION_META[secId] || { label: secId, icon: "📄" };
          const secItems  = visibleItems.filter((i) => i.section === secId);
          const allSecItems = items.filter((i) => i.section === secId);
          const selFields = allSecItems.filter((i) => i.selected).length;
          const replFields = allSecItems.filter((i) => i.conflict_type === "replace").length;
          const isOpen = !!expanded[secId];

          return (
            <div key={secId} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <div
                onClick={() => toggleSection(secId)}
                style={{
                  background: isOpen ? "#f5f3ff" : "#fafafa",
                  padding: "9px 14px",
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  cursor: "pointer", userSelect: "none",
                  borderBottom: isOpen ? "1px solid #ede9fe" : "none",
                }}
              >
                <span style={{ fontSize: 16 }}>{secMeta.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", flex: 1 }}>
                  {secMeta.label}
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                  {selFields}/{allSecItems.length}
                  {replFields > 0 && <span style={{ color: CONFLICT_META.replace.color }}> · ⚠{replFields}</span>}
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && secItems.map((item) => (
                <ChecklistRow key={item.id} item={item} onToggle={onToggle} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid #ede9fe", padding: "12px 18px",
        background: "#faf5ff", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <button
          onClick={onApply}
          disabled={applying || selectedCount === 0}
          style={{ ...s.primaryBtn, opacity: (applying || selectedCount === 0) ? 0.6 : 1 }}
        >
          {applying
            ? <><RefreshCw size={14} style={spin} /> Génération…</>
            : <><Download size={14} /> Appliquer et générer le rapport</>}
        </button>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          {selectedCount === 0
            ? "Sélectionnez au moins un champ."
            : "Le rapport Word sera téléchargé automatiquement."}
        </div>
        {error && <div style={{ ...s.errorBox, width: "100%", marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}

/* ── Truncatable value ──────────────────────────────────────── */
function TruncatableValue({ value }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = value && value.length > 120;
  if (!value) return <span style={{ opacity: 0.4, fontStyle: "italic" }}>vide</span>;
  if (!isLong) return <span style={{ color: "#59169c", fontWeight: 600 }}>{value}</span>;
  return (
    <span style={{ color: "#59169c" }}>
      {expanded ? value : value.slice(0, 120) + "…"}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        style={{
          marginLeft: 6, fontSize: 10, color: "#59169c", background: "none",
          border: "none", cursor: "pointer", padding: 0,
        }}
      >
        {expanded ? "Réduire" : "Voir tout"}
      </button>
    </span>
  );
}

/* ── Checklist row ──────────────────────────────────────────── */
function ChecklistRow({ item, onToggle }) {
  const isApplied = item.conflict_type === "applied";
  const cm = CONFLICT_META[item.conflict_type] || CONFLICT_META.new;

  return (
    <div
      onClick={isApplied ? undefined : () => onToggle(item.id)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "8px 14px",
        borderBottom: "1px solid #f3f4f6",
        background: isApplied ? "#f9fafb" : (item.selected ? "white" : "#fafafa"),
        cursor: isApplied ? "default" : "pointer",
        opacity: isApplied ? 0.65 : 1,
      }}
    >
      <span style={{ flexShrink: 0, color: isApplied ? "#d1d5db" : (item.selected ? "#59169c" : "#d1d5db"), display: "flex", marginTop: 2 }}>
        {isApplied ? <Square size={15} /> : item.selected ? <CheckSquare size={15} /> : <Square size={15} />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 1 }}>{item.label}</div>
        {item.conflict_type === "replace" && (
          <div style={{ fontSize: 10, color: "#b45309", fontWeight: 700, marginBottom: 2 }}>Proposé</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          <TruncatableValue value={item.proposed_value} />
        </div>
        {item.current_value && item.conflict_type !== "applied" && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
            Actuel : {item.current_value}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
        <span
          title={cm.title}
          style={{
            fontSize: 10, fontWeight: 700, color: cm.color, background: cm.bg,
            padding: "2px 6px", borderRadius: 999, whiteSpace: "nowrap",
          }}
        >
          {cm.label}
        </span>
        <SourceTag source={item.source} />
      </div>
    </div>
  );
}

/* ── Source tag ─────────────────────────────────────────────── */
function SourceTag({ source }) {
  if (!source) return <SourceChip color="#9ca3af" label="Estimation IA" />;

  const doc = source.document;
  if (doc && DB_SOURCE_LABELS[doc]) {
    const meta = DB_SOURCE_LABELS[doc];
    return <SourceChip color="#0369a1" label={`${meta.icon} ${meta.label}`} title={source.field ? `${meta.label} → ${source.field}` : meta.label} />;
  }
  if (doc && !DB_SOURCE_LABELS[doc]) {
    const short = truncateMid(doc, 22);
    return <SourceChip color="#059669" label={`📄 ${short}`} title={source.field ? `${doc} → ${source.field}` : doc} />;
  }
  return <SourceChip color="#9ca3af" label="Estimation IA" />;
}

function SourceChip({ color, label, title }) {
  return (
    <span title={title} style={{ fontSize: 10, color, whiteSpace: "nowrap", cursor: title ? "help" : "default" }}>
      {label}
    </span>
  );
}

/* ── History drawer ─────────────────────────────────────────── */
function HistoryDrawer({ history, loading, onClose, projectId }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 999 }}
      />
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 420,
        background: "white", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit",
      }}>
        <div style={{
          padding: "18px 20px", borderBottom: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
        }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>
            🕐 Historique des modifications
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", borderRadius: 8, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 24, color: "#6b7280", fontSize: 13 }}>Chargement…</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 24, color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
              Aucun historique enregistré.
            </div>
          ) : (
            history.map((entry) => <HistoryEntry key={entry.id} entry={entry} projectId={projectId} />)
          )}
        </div>
      </div>
    </>
  );
}

/* ── History entry ──────────────────────────────────────────── */
function HistoryEntry({ entry, projectId }) {
  const isAI = entry.action_type === "AI_PREFILL";
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(e) {
    e.stopPropagation();
    setDownloading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/report/history/${entry.id}/file`);
      if (!res.ok) throw new Error("Fichier indisponible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.file_name || `rapport_${entry.id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || "Erreur lors du téléchargement");
    } finally {
      setDownloading(false);
    }
  }

  const dateStr = new Date(entry.created_at).toLocaleString("fr-BE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const items           = entry.changes?.items || [];
  const sectionsApplied = entry.changes?.sections_applied || [];
  const filename        = entry.changes?.filename;
  const fileSize        = entry.changes?.size;

  // Group items by section
  const sectionIds = [...new Set(items.map((i) => i.section))];

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "13px 20px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          background: open ? "#faf5ff" : "white",
        }}
      >
        {isAI
          ? <FileCheck size={16} style={{ color: "#59169c", flexShrink: 0 }} />
          : <Upload size={16} style={{ color: "#6b7280", flexShrink: 0 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>
            {isAI ? "Pré-remplissage IA" : "Upload manuel"}
          </div>
          {isAI && sectionsApplied.length > 0 && (
            <div style={{ fontSize: 11, color: "#59169c", marginTop: 1 }}>
              {sectionsApplied.map((s) => SECTION_META[s]?.label || s).join(", ")}
            </div>
          )}
          {!isAI && filename && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
              {truncateMid(filename, 32)}
              {fileSize && <span style={{ marginLeft: 4 }}>({Math.round(fileSize / 1024)} Ko)</span>}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#9ca3af" }}>{dateStr}</div>
        </div>
        {entry.has_file ? (
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              padding: "4px 10px", fontSize: 11, borderRadius: 6,
              border: "1px solid #d8b4fe", background: "#faf5ff",
              color: "#59169c", cursor: downloading ? "default" : "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {downloading ? "…" : "⬇ Télécharger"}
          </button>
        ) : null}
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && isAI && items.length > 0 && (
        <div style={{ padding: "8px 20px 14px", background: "#faf5ff" }}>
          {sectionIds.map((secId) => {
            const secMeta = SECTION_META[secId] || { label: secId, icon: "📄" };
            const secItems = items.filter((i) => i.section === secId);
            return (
              <div key={secId} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: "#59169c", marginBottom: 4 }}>
                  {secMeta.icon} {secMeta.label}
                </div>
                {secItems.map((item, idx) => {
                  const cm = CONFLICT_META[item.conflict_type] || CONFLICT_META.new;
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, marginBottom: 4 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}>
                        {item.selected
                          ? <span style={{ color: "#82137e" }}>✅</span>
                          : <span style={{ color: "#9ca3af" }}>⬜</span>}
                      </span>
                      <span style={{ color: "#374151", flex: 1, minWidth: 0 }}>{item.field}</span>
                      <span style={{
                        color: "#59169c", fontWeight: 700, maxWidth: 140,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {item.value}
                      </span>
                      <SourceTag source={item.source} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                        color: cm.color, background: cm.bg,
                        padding: "1px 6px", borderRadius: 999,
                      }}>
                        {cm.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {open && isAI && items.length === 0 && (
        <div style={{ padding: "8px 20px 14px", background: "#faf5ff", fontSize: 12, color: "#9ca3af" }}>
          Détails non disponibles.
        </div>
      )}
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */
const s = {
  card: {
    marginBottom: 0,
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  },
  infoCard: {
    background: "#f8fafc",
    borderRadius: 16,
    padding: 20,
    border: "1px solid #e5e7eb",
  },
  primaryBtn: {
    background: "#59169c", color: "white", border: "none",
    padding: "10px 16px", borderRadius: 12, fontWeight: 700,
    cursor: "pointer", display: "inline-flex", alignItems: "center",
    gap: 7, fontSize: 13,
  },
  ghostBtn: {
    background: "white", color: "#374151", border: "2px solid #e5e7eb",
    padding: "10px 16px", borderRadius: 12, fontWeight: 600,
    cursor: "pointer", display: "inline-flex", alignItems: "center",
    gap: 7, fontSize: 13,
  },
  errorBox: {
    background: "#fee2e2", color: "#8f1d2f",
    padding: "10px 14px", borderRadius: 10,
    fontWeight: 600, fontSize: 13,
  },
};
