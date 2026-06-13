import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Download, Upload, Sparkles, RefreshCw, Trash2,
  Clock, X, CheckSquare, Square,
  AlertTriangle, Info, FileText, FileCheck,
} from "lucide-react";
import { useProject } from "../state/ProjectContext";
import { apiFetch } from "../api";
import TemplateLibraryPanel from "../ui/TemplateLibraryPanel";

/* ── Type labels ────────────────────────────────────────────── */
const TYPE_LABEL = {
  SER_PV: "SER / PV",
  ELECTRIFICATION: "Électrification",
  EFFICACITE_ENERGETIQUE: "Efficacité énergétique",
  CCU: "CCU",
  PPA: "PPA",
  FLUIDE_FRIGORIGENE: "Fluide frigorigène",
};

/* ── Source display helpers ──────────────────────────────────── */
const DB_SOURCE_LABELS = {
  energy_accounting_db: { icon: "📊", label: "Comptabilité énergétique" },
  audit_data_db:        { icon: "📝", label: "Audit" },
};

/* ── Mapping champ → cellule AMUREBA ─────────────────────────── */
const FIELD_META = {
  intitule:          { cell: "B9",  label: "Intitulé",             numeric: false },
  type_amelioration: { cell: "B13", label: "Type d'amélioration",  numeric: false },
  classification:    { cell: "F27", label: "Classification",        numeric: false },
  investissement_k_eur:    { cell: "G61", label: "Investissement (k€)",      numeric: true },
  economie_energie_mwh_an: { cell: "G77", label: "Éco. énergie (MWh/an)",    numeric: true },
  economie_co2_kg_an:      { cell: "G87", label: "Réduction CO₂ (kg/an)",    numeric: true },
  duree_amortissement:     { cell: "K18", label: "Durée amort. (ans)",        numeric: true },
};

/* ── Version source metadata ─────────────────────────────────── */
const SOURCE_META = {
  template:       { label: "Template vierge",    color: "#6b7280", bg: "#f3f4f6", Icon: FileText },
  ai_prefill:     { label: "Pré-rempli par IA",  color: "#59169c", bg: "#f5f3ff", Icon: FileCheck },
  manual_upload:  { label: "Upload manuel",       color: "#0369a1", bg: "#e0f2fe", Icon: Upload },
  ai_patched:     { label: "IA + upload manuel", color: "#0f766e", bg: "#f0fdfa", Icon: FileCheck },
};

/* ── Conflict type metadata ──────────────────────────────────── */
const CONFLICT_META = {
  new:      { label: "Champ vide",               color: "#059669", bg: "#d1fae5", title: "Ce champ est actuellement vide dans le fichier" },
  replace:  { label: "Remplace valeur existante", color: "#b45309", bg: "#fef3c7", title: "Remplacera une valeur déjà présente" },
  uncertain:{ label: "Estimation sans source",    color: "#6b7280", bg: "#f3f4f6", title: "Valeur estimée par l'IA, sans document source" },
  applied:  { label: "Déjà appliquée",            color: "#0369a1", bg: "#e0f2fe", title: "Cette valeur est déjà dans le fichier courant" },
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

function buildChecklistItems(preview) {
  const items = [];
  (preview.actions || []).forEach((action) => {
    const conflictTypes = action.conflict_types || {};
    Object.entries(FIELD_META).forEach(([field, meta]) => {
      const val = action[field];
      if (val == null || val === "") return;
      const ct = conflictTypes[field];
      if (ct === undefined) return; // safety: field not proposed at all
      const currentValue = action.existing_values?.[field] ?? null;
      items.push({
        id:           `${action.sheet}_${field}`,
        sheet:        action.sheet,
        cell:         meta.cell,
        field,
        label:        `${action.sheet} → ${meta.label}`,
        value:        val,
        current_value: currentValue !== null ? String(currentValue) : null,
        is_numeric:   meta.numeric,
        source:       action.sources?.[field] || null,
        conflict_type: ct,
        selected:     ct !== "replace" && ct !== "applied",
      });
    });
  });
  return items;
}

/* Truncate a filename in the middle, keeping the extension visible.
   "facture_engie_complete_2022.pdf" → "facture_eng…_2022.pdf" */
function truncateMid(name, maxLen = 26) {
  if (name.length <= maxLen) return name;
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";          // ".pdf"
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;    // without extension
  // How many chars of the base we can keep on each side
  const available = maxLen - ext.length - 1; // -1 for "…"
  const headLen = Math.ceil(available * 0.6);
  const tailLen = available - headLen;
  return base.slice(0, headLen) + "…" + base.slice(-tailLen) + ext;
}

function fmtValue(field, value) {
  if (value == null) return "—";
  if (typeof value === "number") {
    const n = Number(value).toLocaleString("fr-BE");
    if (field === "investissement_k_eur")    return `${n} k€`;
    if (field === "economie_energie_mwh_an") return `${n} MWh/an`;
    if (field === "economie_co2_kg_an")      return `${n} kg CO₂/an`;
    if (field === "duree_amortissement")     return `${n} ans`;
    return n;
  }
  return String(value);
}

/* ═══════════════════════════════════════════════════════════════
   Composant principal
═══════════════════════════════════════════════════════════════ */
export default function ProjectPlanAmelioration() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();
  const fileRef = useRef(null);

  useEffect(() => { setSelectedProjectId(projectId); }, [projectId]);

  const [project,      setProject]      = useState(null);
  const [actions,      setActions]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [pageError,    setPageError]    = useState("");

  /* Prefill status (persisté en base) */
  const [prefillStatus, setPrefillStatus] = useState(null);

  /* Étape 1 — Analyse IA → checklist */
  const [analyzing,      setAnalyzing]      = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [analyzeError,   setAnalyzeError]   = useState("");
  /* Context info about the preview (has_existing_excel, current_excel_source) */
  const [previewContext, setPreviewContext] = useState(null);

  /* Étape 2 — Appliquer */
  const [applying,    setApplying]    = useState(false);
  const [applyError,  setApplyError]  = useState("");

  /* Upload */
  const [uploading,  setUploading]  = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState("");
  const [uploadError,setUploadError]= useState("");

  /* Download */
  const [downloading, setDownloading] = useState(false);

  /* Delete */
  const [deletingId, setDeletingId] = useState(null);

  /* Historique */
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* Modèle actif (bibliothèque) : prefill IA indisponible si custom (supports_prefill=false) */
  const [prefillDisabled, setPrefillDisabled] = useState(false);

  /* ── Chargement initial ──────────────────────────────────── */
  async function loadAll() {
    setLoading(true);
    setPageError("");
    try {
      const [resP, resA, resS] = await Promise.all([
        apiFetch("/projects"),
        apiFetch(`/projects/${projectId}/improvement-actions`),
        apiFetch(`/projects/${projectId}/improvement-actions/prefill-status`),
      ]);
      if (!resP.ok) throw new Error("Impossible de charger le projet");
      const list = await resP.json();
      setProject(list.find((x) => x.id === projectId) || null);
      setActions(resA.ok ? await resA.json() : []);
      setPrefillStatus(resS.ok ? await resS.json() : null);
    } catch (e) {
      setPageError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [projectId]);

  /* ── Charger l'historique ───────────────────────────────── */
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/improvement-actions/history`);
      if (res.ok) setHistory(await res.json());
    } catch (_) {}
    finally { setHistoryLoading(false); }
  }

  function openHistory() {
    setHistoryOpen(true);
    loadHistory();
  }

  /* ── Helpers download ───────────────────────────────────── */
  function _triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  function _safeName() {
    return (project?.project_name || "projet")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
  }

  /* ── Télécharger le fichier courant (pré-rempli ou template) */
  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/improvement-actions/export-excel`);
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      const source = prefillStatus?.current_excel_source || "template";
      const suffix = source === "template" ? "" : `_${source}`;
      _triggerDownload(await res.blob(), `AMUREBA${suffix}_${_safeName()}.xlsx`);
    } catch (e) {
      setPageError(e.message || "Erreur lors du téléchargement");
    } finally {
      setDownloading(false);
    }
  }

  /* ── Étape 1 : Analyser les documents ──────────────────── */
  async function handleAnalyze() {
    setAnalyzing(true);
    setChecklistItems([]);
    setAnalyzeError("");
    setApplyError("");
    setPreviewContext(null);
    try {
      const res = await apiFetch(
        `/projects/${projectId}/improvement-actions/prefill-preview`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Erreur serveur (${res.status})`);
      }
      const data = await res.json();
      setPreviewContext({
        has_existing_excel: data.has_existing_excel,
        current_excel_source: data.current_excel_source,
      });
      setChecklistItems(buildChecklistItems(data));
    } catch (e) {
      setAnalyzeError(e.message || "Erreur lors de l'analyse IA");
    } finally {
      setAnalyzing(false);
    }
  }

  /* ── Checklist toggle ───────────────────────────────────── */
  const toggleItem = (id) =>
    setChecklistItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it))
    );

  const toggleAll = (val) =>
    setChecklistItems((prev) => prev.map((it) => ({ ...it, selected: val })));

  /* ── Étape 2 : Appliquer les changements sélectionnés ───── */
  async function handleApply() {
    setApplying(true);
    setApplyError("");
    try {
      const res = await apiFetch(
        `/projects/${projectId}/improvement-actions/apply-prefill`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: checklistItems }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Erreur serveur (${res.status})`);
      }
      _triggerDownload(await res.blob(), `AMUREBA_prefill_${_safeName()}.xlsx`);
      // Refresh status + clear checklist
      const resS = await apiFetch(`/projects/${projectId}/improvement-actions/prefill-status`);
      if (resS.ok) setPrefillStatus(await resS.json());
      setChecklistItems([]);
      setPreviewContext(null);
    } catch (e) {
      setApplyError(e.message || "Erreur lors de l'application");
    } finally {
      setApplying(false);
    }
  }

  /* ── Upload Excel complété ──────────────────────────────── */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setUploadMsg("");
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(
        `/projects/${projectId}/improvement-actions/import-excel`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || `Erreur serveur (${res.status})`);
      }
      const data = await res.json();
      setUploadMsg(`✅ ${data.imported} action${data.imported !== 1 ? "s" : ""} importée${data.imported !== 1 ? "s" : ""}. L'Excel uploadé est maintenant la version courante.`);
      await loadAll();
    } catch (e) {
      setUploadError(e.message || "Erreur lors de l'import");
    } finally {
      setUploading(false);
    }
  }

  /* ── Supprimer une action ───────────────────────────────── */
  async function handleDelete(actionId) {
    if (!window.confirm("Supprimer cette action ?")) return;
    setDeletingId(actionId);
    try {
      await apiFetch(`/projects/${projectId}/improvement-actions/${actionId}`, { method: "DELETE" });
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    } catch (e) {
      setPageError(e.message || "Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  }

  const currentSource = prefillStatus?.current_excel_source || "template";
  const hasExcel = prefillStatus?.has_prefilled_excel;

  if (loading) return <div style={{ color: "#6b7280" }}>Chargement…</div>;
  if (!project) return <div style={{ color: "#6b7280" }}>Projet introuvable.</div>;

  const selectedCount = checklistItems.filter((i) => i.selected).length;

  return (
    <div style={{ maxWidth: 1400, width: "100%" }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Projet</div>
          <h1 style={{ fontSize: 32, margin: "4px 0 2px", color: "#111827" }}>
            Audit — {project.project_name}
          </h1>
          <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
            Gérez vos actions d'amélioration énergétique.
          </div>
        </div>
        <button
          onClick={openHistory}
          style={{ ...s.ghostBtn, fontSize: 12, padding: "8px 14px", marginTop: 8, whiteSpace: "nowrap" }}
        >
          <Clock size={13} />
          Historique
        </button>
      </div>

      {pageError && <div style={{ ...s.errorBox, marginBottom: 16 }}>{pageError}</div>}

      {/* ── Deux zones : workflow (gauche) + modèles (droite) ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>

      <SectionCard title="AMUREBA — Pré-remplissage IA & Excel">

        {/* ── Bandeau version courante ──────────────────── */}
        <CurrentVersionBanner
          prefillStatus={prefillStatus}
          downloading={downloading}
          onDownload={handleDownload}
        />

        {/* ── État A : checklist en cours ───────────────── */}
        {checklistItems.length > 0 ? (
          <ChecklistPanel
            items={checklistItems}
            applying={applying}
            selectedCount={selectedCount}
            previewContext={previewContext}
            onToggle={toggleItem}
            onToggleAll={toggleAll}
            onApply={handleApply}
            onClose={() => { setChecklistItems([]); setPreviewContext(null); }}
            error={applyError}
          />
        ) : (
          /* ── Actions disponibles ─────────────────────── */
          <WorkflowActions
            hasExcel={hasExcel}
            currentSource={currentSource}
            analyzing={analyzing}
            onAnalyze={handleAnalyze}
            analyzeError={analyzeError}
            prefillDisabled={prefillDisabled}
          />
        )}

        {/* ── Section Upload ────────────────────────────── */}
        <UploadSection
          uploading={uploading}
          uploadMsg={uploadMsg}
          uploadError={uploadError}
          fileRef={fileRef}
          onUpload={handleUpload}
        />
      </SectionCard>

      {/* ══ Section Données importées ═══════════════════════ */}
      <SectionCard
        title={
          <span>
            Données importées
            {actions.length > 0 && (
              <span style={{
                marginLeft: 8, background: "#ede9fe", color: "#59169c",
                fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              }}>
                {actions.length}
              </span>
            )}
          </span>
        }
        subtitle={actions.length > 0 ? "Ces données sont disponibles dans tous les modules du projet." : undefined}
      >
        {actions.length === 0 ? (
              <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 14, padding: "24px 0" }}>
                Aucune action n'a été importée. Veuillez importer un fichier Excel AMUREBA complété.
              </div>
            ) : (
              <>
                <SummaryBanner actions={actions} />
                <div style={{ overflowX: "auto", marginTop: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {["Réf.", "Intitulé", "Type", "Classif.", "Invest. (k€)", "Éco énergie (MWh/an)", "Éco CO₂ (kg/an)", "PBT av. imp.", "IRR av. imp.", ""].map((h, i) => (
                          <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap", fontSize: 12 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map((a) => (
                        <tr
                          key={a.id}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#faf5ff")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "10px 12px" }}><span style={s.refBadge}>{a.reference || "—"}</span></td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827", maxWidth: 200 }}>{a.intitule}</td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                            {TYPE_LABEL[a.type_amelioration] || a.type_amelioration || "—"}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {a.classification ? (
                              <span style={{
                                background: a.classification === "A" ? "#dcfce7" : "#fef9c3",
                                color:      a.classification === "A" ? "#166534" : "#854d0e",
                                fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              }}>{a.classification}</span>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{a.investissement != null ? Number(a.investissement).toLocaleString("fr-BE") : "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{a.economie_energie != null ? Number(a.economie_energie).toLocaleString("fr-BE") : "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{a.economie_co2 != null ? Number(a.economie_co2).toLocaleString("fr-BE") : "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{a.pbt_avant_impot != null ? a.pbt_avant_impot : "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#374151" }}>{a.irr_avant_impot != null ? `${a.irr_avant_impot} %` : "—"}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <button
                              onClick={() => handleDelete(a.id)}
                              disabled={deletingId === a.id}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", padding: 4, borderRadius: 6, display: "flex", alignItems: "center", opacity: deletingId === a.id ? 0.5 : 1 }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "#d1d5db")}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
      </SectionCard>

        </div>{/* fin ZONE PRINCIPALE */}

        {/* PANNEAU DROITE — bibliothèque de modèles */}
        <div style={{ flex: "1 1 320px", maxWidth: 380 }}>
          <TemplateLibraryPanel
            type="audit"
            projectId={projectId}
            activeTemplateId={project.active_audit_template_id}
            onActiveChange={(id) => setProject((p) => (p ? { ...p, active_audit_template_id: id } : p))}
            onCapabilityChange={(supportsPrefill) => setPrefillDisabled(!supportsPrefill)}
          />
        </div>

      </div>{/* fin deux zones */}

      {/* ── Historique drawer ────────────────────────────────── */}
      {historyOpen && (
        <HistoryDrawer
          history={history}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
          projectId={projectId}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const spin = { animation: "spin 1s linear infinite" };

/* ── Bandeau version courante ───────────────────────────────── */
function CurrentVersionBanner({ prefillStatus, downloading, onDownload }) {
  const source = prefillStatus?.current_excel_source || "template";
  const meta   = SOURCE_META[source] || SOURCE_META.template;
  const hasExcel = prefillStatus?.has_prefilled_excel;

  const dateStr = prefillStatus?.prefilled_at
    ? new Date(prefillStatus.prefilled_at).toLocaleString("fr-BE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 10,
      background: meta.bg, border: `1px solid ${meta.color}33`,
      borderRadius: 10, padding: "10px 14px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <meta.Icon size={18} style={{ color: meta.color, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: meta.color }}>
            Version courante : {meta.label}
          </div>
          {dateStr && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              {source === "manual_upload" ? "Uploadé" : "Généré"} le {dateStr}
            </div>
          )}
          {!hasExcel && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Aucun fichier Excel enregistré. Analysez les documents ou uploadez un fichier.
            </div>
          )}
        </div>
      </div>
      {hasExcel && (
        <button
          onClick={onDownload}
          disabled={downloading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8,
            border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#374151",
            cursor: downloading ? "default" : "pointer",
            opacity: downloading ? 0.7 : 1,
          }}
        >
          <Download size={13} />
          {downloading ? "Téléchargement…" : "Télécharger la version courante"}
        </button>
      )}
    </div>
  );
}

/* ── Actions workflow ──────────────────────────────────────── */
function WorkflowActions({ hasExcel, currentSource, analyzing, onAnalyze, analyzeError, prefillDisabled }) {
  const isReanalyze = hasExcel;
  const btnLabel = isReanalyze
    ? (currentSource === "manual_upload"
        ? "Proposer des compléments IA sur l'upload"
        : "Relancer l'analyse IA")
    : "Analyser les documents avec l'IA";

  return (
    <div>
      {!hasExcel && (
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14, lineHeight: 1.7 }}>
          <strong>Workflow :</strong> Analysez les documents → sélectionnez les valeurs proposées
          → téléchargez l'Excel pré-rempli → complétez dans Excel → uploadez le fichier complété.
        </div>
      )}
      {isReanalyze && currentSource === "manual_upload" && (
        <div style={{ ...s.infoBanner, marginBottom: 14 }}>
          <Info size={14} style={{ flexShrink: 0, color: "#374151" }} />
          L'IA proposera uniquement des compléments. Les propositions seront appliquées sur votre
          fichier uploadé, sans écraser les cellules déjà remplies (sauf si vous le validez).
        </div>
      )}
      {prefillDisabled && (
        <div style={{ ...s.infoBanner, marginBottom: 14 }}>
          <Info size={14} style={{ flexShrink: 0, color: "#374151" }} />
          Pré-remplissage IA indisponible avec un modèle personnalisé — mode manuel
          (télécharger → remplir → réimporter).
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          onClick={onAnalyze}
          disabled={analyzing || prefillDisabled}
          style={{ ...s.primaryBtn, opacity: (analyzing || prefillDisabled) ? 0.7 : 1, cursor: prefillDisabled ? "not-allowed" : "pointer" }}
        >
          {analyzing
            ? <><RefreshCw size={15} style={spin} /> Analyse IA…</>
            : <><Sparkles size={15} /> {btnLabel}</>}
        </button>
      </div>
      {analyzeError && (
        <div style={{ ...s.errorBox, marginTop: 14 }}>
          {analyzeError.includes("Aucun document") ? (
            <>
              <strong>Aucun document analysé.</strong> Uploadez et analysez des factures
              dans le module <em>Documents</em> d'abord.
            </>
          ) : analyzeError}
        </div>
      )}
    </div>
  );
}

/* ── Section Upload (toujours visible) ─────────────────────── */
function UploadSection({ uploading, uploadMsg, uploadError, fileRef, onUpload }) {
  return (
    <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 18, paddingTop: 14 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>
        📤 Uploader un Excel AMUREBA complété
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10, lineHeight: 1.6 }}>
        Le fichier uploadé devient la version courante. Les prochains exports et les futures
        propositions IA partiront de ce fichier.
      </div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{ ...s.outlineBtn, fontSize: 12, padding: "8px 14px", opacity: uploading ? 0.7 : 1 }}
      >
        {uploading
          ? <><RefreshCw size={14} style={spin} /> Import en cours…</>
          : <><Upload size={14} /> Uploader l'Excel complété</>}
      </button>
      <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onUpload} />
      {uploadMsg   && <div style={{ ...s.okBox,    marginTop: 10 }}>{uploadMsg}</div>}
      {uploadError && <div style={{ ...s.errorBox, marginTop: 10 }}>{uploadError}</div>}
    </div>
  );
}

/* ── Panel checklist ────────────────────────────────────────── */
function ChecklistPanel({ items, applying, selectedCount, previewContext, onToggle, onToggleAll, onApply, onClose, error }) {
  const allSelected   = items.length > 0 && items.every((i) => i.selected);
  const totalReplaces = items.filter((i) => i.conflict_type === "replace").length;

  const [activeFilter, setActiveFilter] = useState("todo");

  const visibleItems = filterItems(items, activeFilter);
  const sheets = [...new Set(visibleItems.map((i) => i.sheet))];

  // Expand/collapse state per sheet — first sheet open by default
  const [expanded, setExpanded] = useState(() =>
    Object.fromEntries([...new Set(items.map((i) => i.sheet))].map((sh, idx) => [sh, idx === 0]))
  );
  const allExpanded = sheets.every((sh) => expanded[sh]);

  const toggleSheet = (sh) =>
    setExpanded((prev) => ({ ...prev, [sh]: !prev[sh] }));
  const toggleAllSheets = () =>
    setExpanded(Object.fromEntries(sheets.map((sh) => [sh, !allExpanded])));

  return (
    <div style={{ border: "1.5px solid #ede9fe", borderRadius: 14, overflow: "hidden", marginBottom: 4 }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        background: "#f5f3ff", padding: "12px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#4c1d95" }}>Propositions IA</div>
          <div style={{ fontSize: 12, color: "#59169c", marginTop: 2 }}>
            {selectedCount} cellule{selectedCount !== 1 ? "s" : ""} sélectionnée{selectedCount !== 1 ? "s" : ""}
            {totalReplaces > 0 && (
              <span style={{ marginLeft: 8, color: CONFLICT_META.replace.color, fontWeight: 700 }}>
                · ⚠ {totalReplaces} remplacement{totalReplaces !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={toggleAllSheets} style={{ ...s.ghostBtn, fontSize: 11, padding: "5px 10px" }}>
            {allExpanded ? "▲ Tout replier" : "▼ Tout ouvrir"}
          </button>
          <button onClick={() => onToggleAll(!allSelected)} style={{ ...s.ghostBtn, fontSize: 11, padding: "5px 10px" }}>
            {allSelected ? <><Square size={12} /> Tout décocher</> : <><CheckSquare size={12} /> Tout cocher</>}
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "2px 6px", borderRadius: 6 }} title="Fermer">
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

      {/* ── Corps — cartes par action ─────────────────────── */}
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {sheets.map((sheet) => {
          const allSheetItems = items.filter((i) => i.sheet === sheet);
          const sheetItems   = visibleItems.filter((i) => i.sheet === sheet);
          const intitule     = allSheetItems.find((i) => i.field === "intitule")?.value || "";
          const classif      = allSheetItems.find((i) => i.field === "classification")?.value || "";
          const type         = allSheetItems.find((i) => i.field === "type_amelioration")?.value || "";
          const totalFields  = sheetItems.length;
          const selFields    = sheetItems.filter((i) => i.selected).length;
          const replFields   = sheetItems.filter((i) => i.conflict_type === "replace").length;
          const isOpen       = !!expanded[sheet];

          return (
            <div key={sheet} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              {/* Groupe header (cliquable) */}
              <div
                onClick={() => toggleSheet(sheet)}
                style={{
                  background: isOpen ? "#f5f3ff" : "#fafafa",
                  padding: "9px 14px",
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  cursor: "pointer", userSelect: "none",
                  borderBottom: isOpen ? "1px solid #ede9fe" : "none",
                }}
              >
                <span style={{ background: "#59169c", color: "white", fontWeight: 800, fontSize: 11, padding: "3px 9px", borderRadius: 6, flexShrink: 0 }}>
                  {sheet}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#111827", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {intitule || "—"}
                </span>
                {type && <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>{type}</span>}
                {classif && (
                  <span style={{
                    background: classif === "A" ? "#dcfce7" : "#fef9c3",
                    color:      classif === "A" ? "#166534" : "#854d0e",
                    fontWeight: 700, fontSize: 10, padding: "2px 7px", borderRadius: 20, flexShrink: 0,
                  }}>
                    Cl. {classif}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                  {selFields}/{totalFields}
                  {replFields > 0 && <span style={{ color: CONFLICT_META.replace.color }}> · ⚠{replFields}</span>}
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Corps de la carte */}
              {isOpen && sheetItems.map((item) => (
                <ChecklistRow key={item.id} item={item} onToggle={onToggle} />
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
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
            : <><Download size={14} /> Appliquer et télécharger l'Excel</>}
        </button>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          {selectedCount === 0
            ? "Sélectionnez au moins une proposition."
            : previewContext?.has_existing_excel
              ? "Les changements sélectionnés seront appliqués sur la version courante."
              : "Les changements sélectionnés seront injectés dans le template AMUREBA."}
        </div>
        {error && <div style={{ ...s.errorBox, width: "100%", marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}

/* ── Légende des types de conflit ────────────────────────────── */
function ConflictLegend() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
      {Object.entries(CONFLICT_META).map(([type, m]) => (
        <span key={type} title={m.title} style={{
          background: m.bg, color: m.color, fontWeight: 700,
          padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
        }}>
          {m.label}
        </span>
      ))}
    </div>
  );
}

/* ── Valeur tronquable ──────────────────────────────────────── */
function TruncatableValue({ value }) {
  const [expanded, setExpanded] = useState(false);
  const str = value !== null && value !== undefined ? String(value) : "";
  const isLong = str.length > 120;
  if (!str) return <span style={{ opacity: 0.4, fontStyle: "italic" }}>vide</span>;
  if (!isLong) return <span style={{ color: "#59169c", fontWeight: 600 }}>{str}</span>;
  return (
    <span style={{ color: "#59169c" }}>
      {expanded ? str : str.slice(0, 120) + "…"}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        style={{ marginLeft: 6, fontSize: 10, color: "#59169c", background: "none",
          border: "none", cursor: "pointer", padding: 0 }}>
        {expanded ? "Réduire" : "Voir tout"}
      </button>
    </span>
  );
}

/* ── Ligne de la checklist ──────────────────────────────────── */
function ChecklistRow({ item, onToggle }) {
  const isApplied = item.conflict_type === "applied";
  const label = item.label.split(" → ")[1] || item.label;
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
      {/* Checkbox */}
      <span style={{ flexShrink: 0, color: isApplied ? "#d1d5db" : (item.selected ? "#59169c" : "#d1d5db"), display: "flex", marginTop: 2 }}>
        {isApplied ? <Square size={15} /> : item.selected ? <CheckSquare size={15} /> : <Square size={15} />}
      </span>

      {/* Cellule ref */}
      <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", flexShrink: 0, minWidth: 30, marginTop: 3 }}>
        {item.cell}
      </span>

      {/* Champ */}
      <span style={{ fontSize: 12, color: "#374151", fontWeight: 600, flex: 1, minWidth: 0, marginTop: 2 }}>
        {label}
      </span>

      {/* Valeur proposée + actuel */}
      <div style={{ flexShrink: 0, maxWidth: 150 }}>
        {item.conflict_type === "replace" && (
          <div style={{ fontSize: 10, color: "#b45309", fontWeight: 700, marginBottom: 2 }}>Proposé</div>
        )}
        <div style={{ fontSize: 13 }}>
          <TruncatableValue value={item.is_numeric ? fmtValue(item.field, item.value) : item.value} />
        </div>
        {item.current_value && item.conflict_type !== "applied" && (
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
            Actuel : {item.current_value}
          </div>
        )}
      </div>

      {/* Source */}
      <SourceTag source={item.source} />

      {/* Tag conflit */}
      <span
        title={cm.title}
        style={{
          fontSize: 10, fontWeight: 700, color: cm.color, background: cm.bg,
          padding: "2px 6px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap",
        }}
      >
        {cm.label}
      </span>
    </div>
  );
}

/* ── Tag source ─────────────────────────────────────────────── */
function SourceTag({ source }) {
  // No source object at all → estimation
  if (!source) {
    return <SourceChip color="#9ca3af" label="Estimation IA" />;
  }

  const doc = source.document;

  // Priority 1: real uploaded document (not a known DB key, not null, not estimated)
  if (doc && !DB_SOURCE_LABELS[doc]) {
    const short = truncateMid(doc, 26);
    const tooltip = source.field ? `${doc} → ${source.field}` : doc;
    return <SourceChip color="#059669" label={`📄 ${short}`} title={tooltip} />;
  }

  // Priority 2: known DB source
  if (doc && DB_SOURCE_LABELS[doc]) {
    const meta = DB_SOURCE_LABELS[doc];
    const tooltip = source.field ? `${meta.label} → ${source.field}` : meta.label;
    return <SourceChip color="#0369a1" label={`${meta.icon} ${meta.label}`} title={tooltip} />;
  }

  // Fallback: IA estimate
  return <SourceChip color="#9ca3af" label="Estimation IA" />;
}

function SourceChip({ color, label, title }) {
  return (
    <span
      title={title}
      style={{ fontSize: 11, color, flexShrink: 0, whiteSpace: "nowrap", cursor: title ? "help" : "default" }}
    >
      {label}
    </span>
  );
}

/* ── Drawer historique ──────────────────────────────────────── */
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
        zIndex: 1000, display: "flex", flexDirection: "column",
        fontFamily: "inherit",
      }}>
        {/* En-tête */}
        <div style={{
          padding: "18px 20px", borderBottom: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
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

        {/* Contenu */}
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

/* ── Entrée d'historique ────────────────────────────────────── */
function HistoryEntry({ entry, projectId }) {
  const isAI = entry.action_type === "AI_PREFILL";
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(e) {
    e.stopPropagation();
    setDownloading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/improvement-actions/history/${entry.id}/file`);
      if (!res.ok) throw new Error("Fichier indisponible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.file_name || `plan_amelioration_${entry.id}.xlsx`;
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

  const items   = entry.changes?.items || [];
  const summary = entry.changes?.excel_summary;
  const baseSource = entry.changes?.base_source;

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
          {isAI && baseSource && baseSource !== "template" && (
            <div style={{ fontSize: 11, color: "#374151" }}>
              Patché sur : {SOURCE_META[baseSource]?.label || baseSource}
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

      {open && (
        <div style={{ padding: "8px 20px 14px", background: "#faf5ff" }}>
          {isAI && items.length > 0 ? (
            <>
              {[...new Set(items.map((i) => i.sheet))].map((sheet) => {
                const sheetItems = items.filter((i) => i.sheet === sheet);
                return (
                  <div key={sheet} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#59169c", marginBottom: 4 }}>{sheet}</div>
                    {sheetItems.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ flexShrink: 0 }}>
                          {item.selected
                            ? <span style={{ color: "#82137e" }}>✅</span>
                            : <span style={{ color: "#9ca3af" }}>⬜</span>}
                        </span>
                        <span style={{ color: "#374151", flex: 1 }}>
                          {(item.label || "").split(" → ")[1] || item.label}
                        </span>
                        <span style={{ color: "#59169c", fontWeight: 700 }}>
                          {fmtValue(item.field, item.value)}
                        </span>
                        <SourceTag source={item.source} />
                        {item.conflict_type && CONFLICT_META[item.conflict_type] && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: CONFLICT_META[item.conflict_type].color,
                            background: CONFLICT_META[item.conflict_type].bg,
                            padding: "1px 6px", borderRadius: 999,
                          }}>
                            {CONFLICT_META[item.conflict_type].label}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ) : isAI ? (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Détails non disponibles.</div>
          ) : null}

          {!isAI && summary && (
            <div style={{ fontSize: 12, color: "#374151", display: "flex", flexDirection: "column", gap: 4 }}>
              <div><strong>{summary.nb_actions}</strong> action(s) importée(s)</div>
              {summary.total_investissement_k_eur != null && (
                <div>Investissement total : <strong>{Number(summary.total_investissement_k_eur).toLocaleString("fr-BE")} k€</strong></div>
              )}
              {summary.total_economie_energie_mwh_an != null && (
                <div>Éco. énergie : <strong>{Number(summary.total_economie_energie_mwh_an).toLocaleString("fr-BE")} MWh/an</strong></div>
              )}
              {summary.total_economie_co2_kg_an != null && (
                <div>Réd. CO₂ : <strong>{Number(summary.total_economie_co2_kg_an).toLocaleString("fr-BE")} kg/an</strong></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Résumé chiffré ─────────────────────────────────────────── */
function SummaryBanner({ actions }) {
  const invest = actions.reduce((s, a) => s + (a.investissement || 0), 0);
  const energie = actions.reduce((s, a) => s + (a.economie_energie || 0), 0);
  const co2 = actions.reduce((s, a) => s + (a.economie_co2 || 0), 0);
  const nbA = actions.filter((a) => a.classification === "A").length;

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {[
        { label: "Investissement total",  value: `${invest.toLocaleString("fr-BE")} k€` },
        { label: "Éco énergie totale",    value: `${energie.toLocaleString("fr-BE")} MWh/an` },
        { label: "Réductions CO₂",        value: `${co2.toLocaleString("fr-BE")} kg/an` },
        { label: "Actions classe A",      value: `${nbA} / ${actions.length}` },
      ].map((stat) => (
        <div key={stat.label} style={{ flex: "1 1 160px", background: "#f5f3ff", border: "1px solid #ede9fe", borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#59169c", fontWeight: 700, marginBottom: 4 }}>{stat.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── SectionCard ────────────────────────────────────────────── */
function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: "white", borderRadius: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.06)", padding: "20px 22px", marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: "#111827", marginBottom: subtitle ? 4 : 16 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */
const s = {
  primaryBtn: {
    background: "#59169c", color: "white", border: "none",
    padding: "10px 16px", borderRadius: 12, fontWeight: 700,
    cursor: "pointer", display: "inline-flex", alignItems: "center",
    gap: 7, fontSize: 13,
  },
  outlineBtn: {
    background: "white", color: "#59169c", border: "2px solid #59169c",
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
  okBox: {
    background: "#f3f4f6", color: "#374151",
    padding: "10px 14px", borderRadius: 10,
    fontWeight: 600, fontSize: 13,
  },
  refBadge: {
    background: "#ede9fe", color: "#59169c",
    fontWeight: 700, fontSize: 11,
    padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap",
  },
  infoBanner: {
    background: "#f3f4f6", color: "#374151",
    border: "1px solid #e5e7eb",
    padding: "8px 12px", borderRadius: 8, fontSize: 12,
    display: "flex", alignItems: "flex-start", gap: 8,
  },
};
