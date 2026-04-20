import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Upload, Sparkles, RefreshCw, Trash2, Clock, X, CheckSquare, Square } from "lucide-react";
import { useProject } from "../state/ProjectContext";
import { apiFetch } from "../api";

/* ── Type labels ────────────────────────────────────────────── */
const TYPE_LABEL = {
  SER_PV: "SER / PV",
  ELECTRIFICATION: "Électrification",
  EFFICACITE_ENERGETIQUE: "Efficacité énergétique",
  CCU: "CCU",
  PPA: "PPA",
  FLUIDE_FRIGORIGENE: "Fluide frigorigène",
};

/* ── Onglets du plan d'amélioration ─────────────────────────── */
const TABS = [
  { value: "AMUREBA", label: "AMUREBA", available: true },
  { value: "PEB",     label: "PEB",     available: false },
  { value: "AUTRE",   label: "Autre",   available: false },
  { value: "CUSTOM",  label: "📁 Mon propre template", available: false },
];

/* ── Mapping champ → cellule AMUREBA ─────────────────────────── */
const FIELD_META = {
  // Tous les champs proposés par l'IA peuvent être cochés individuellement.
  intitule:          { cell: "B9",  label: "Intitulé",             numeric: false },
  type_amelioration: { cell: "B13", label: "Type d'amélioration",  numeric: false },
  classification:    { cell: "F27", label: "Classification",        numeric: false },
  investissement_k_eur:    { cell: "G61", label: "Investissement (k€)",      numeric: true },
  economie_energie_mwh_an: { cell: "G77", label: "Éco. énergie (MWh/an)",    numeric: true },
  economie_co2_kg_an:      { cell: "G87", label: "Réduction CO₂ (kg/an)",    numeric: true },
  duree_amortissement:     { cell: "K18", label: "Durée amort. (ans)",        numeric: true },
};

function buildChecklistItems(preview) {
  const items = [];
  (preview.actions || []).forEach((action) => {
    Object.entries(FIELD_META).forEach(([field, meta]) => {
      const val = action[field];
      if (val == null || val === "") return;
      items.push({
        id:         `${action.sheet}_${field}`,
        sheet:      action.sheet,
        cell:       meta.cell,
        field,
        label:      `${action.sheet} → ${meta.label}`,
        value:      val,
        is_numeric: meta.numeric,
        source:     action.sources?.[field] || null,
        selected:   true,
      });
    });
  });
  return items;
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
  const [activeTab,    setActiveTab]    = useState("AMUREBA");

  /* Prefill status (persisté en base) */
  const [prefillStatus, setPrefillStatus] = useState(null);

  /* Étape 1 — Analyse IA → checklist */
  const [analyzing,      setAnalyzing]      = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);  // items plats avec selected
  const [analyzeError,   setAnalyzeError]   = useState("");

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

  /* ── Étape 1 : Analyser les documents ──────────────────── */
  async function handleAnalyze() {
    setAnalyzing(true);
    setChecklistItems([]);
    setAnalyzeError("");
    setApplyError("");
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
      // Rafraîchir status + vider checklist
      const resS = await apiFetch(`/projects/${projectId}/improvement-actions/prefill-status`);
      if (resS.ok) setPrefillStatus(await resS.json());
      setChecklistItems([]);
    } catch (e) {
      setApplyError(e.message || "Erreur lors de l'application");
    } finally {
      setApplying(false);
    }
  }

  /* ── Télécharger le fichier pré-rempli sauvegardé ─────── */
  async function handleDownloadPrefilled() {
    setDownloading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/improvement-actions/export-excel`);
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      _triggerDownload(await res.blob(), `AMUREBA_prefill_${_safeName()}.xlsx`);
    } catch (e) {
      setPageError(e.message || "Erreur lors du téléchargement");
    } finally {
      setDownloading(false);
    }
  }

  /* ── Télécharger le template vierge ─────────────────────── */
  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/improvement-actions/export-excel`);
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      _triggerDownload(await res.blob(), `AMUREBA_${_safeName()}.xlsx`);
    } catch (e) {
      setPageError(e.message || "Erreur lors du téléchargement");
    } finally {
      setDownloading(false);
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
      setUploadMsg(`✅ ${data.imported} action${data.imported !== 1 ? "s" : ""} importée${data.imported !== 1 ? "s" : ""} avec succès.`);
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

  /* ── Détecter si de nouveaux docs depuis le dernier prefill ─ */
  const hasPrefill = prefillStatus?.has_prefilled_excel;

  if (loading) return <div style={{ color: "#6b7280" }}>Chargement…</div>;
  if (!project) return <div style={{ color: "#6b7280" }}>Projet introuvable.</div>;

  const selectedCount = checklistItems.filter((i) => i.selected).length;

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Projet</div>
          <h1 style={{ fontSize: 32, margin: "4px 0 2px", color: "#111827" }}>
            Plan d'amélioration — {project.project_name}
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

      {pageError && <div style={s.errorBox}>{pageError}</div>}

      {/* ── Onglets ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => tab.available && setActiveTab(tab.value)}
            style={{
              padding: "9px 18px",
              border: "none",
              borderBottom: activeTab === tab.value ? "3px solid #6d28d9" : "3px solid transparent",
              background: "none",
              fontWeight: activeTab === tab.value ? 800 : 600,
              fontSize: 13,
              color: activeTab === tab.value ? "#6d28d9" : tab.available ? "#374151" : "#9ca3af",
              cursor: tab.available ? "pointer" : "not-allowed",
              marginBottom: -2,
              transition: "all 0.12s",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {tab.label}
            {!tab.available && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                background: "#f3f4f6", color: "#9ca3af",
                padding: "1px 6px", borderRadius: 20,
              }}>
                Bientôt
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ Onglet AMUREBA ════════════════════════════════════ */}
      {activeTab === "AMUREBA" && (
        <>
          <SectionCard title="Pré-remplissage IA & Excel">

            {/* ── État A : checklist en cours ───────────────── */}
            {checklistItems.length > 0 ? (
              <ChecklistPanel
                items={checklistItems}
                applying={applying}
                selectedCount={selectedCount}
                onToggle={toggleItem}
                onToggleAll={toggleAll}
                onApply={handleApply}
                onClose={() => setChecklistItems([])}
                error={applyError}
              />
            ) : hasPrefill ? (
              /* ── État B : déjà pré-rempli ──────────────────── */
              <>
                <PrefillStatusBanner
                  prefillStatus={prefillStatus}
                  downloading={downloading}
                  analyzing={analyzing}
                  onDownload={handleDownloadPrefilled}
                  onReanalyze={handleAnalyze}
                />
                <SavedSummary prefillStatus={prefillStatus} />
              </>
            ) : (
              /* ── État C : aucun prefill ─────────────────────── */
              <>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, lineHeight: 1.7 }}>
                  Workflow en 3 étapes :<br />
                  <strong>1.</strong> Analysez les documents → sélectionnez les valeurs proposées →
                  téléchargez l'Excel pré-rempli.<br />
                  <strong>2.</strong> Complétez les feuilles AA1–AA9 dans Excel.<br />
                  <strong>3.</strong> Uploadez le fichier complété pour enregistrer les données en base.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    style={{ ...s.primaryBtn, opacity: analyzing ? 0.7 : 1 }}
                  >
                    {analyzing
                      ? <><RefreshCw size={15} style={spin} /> Analyse IA…</>
                      : <><Sparkles size={15} /> Analyser les documents</>}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ ...s.ghostBtn, opacity: downloading ? 0.7 : 1 }}
                  >
                    <Download size={15} />
                    {downloading ? "Téléchargement…" : "Télécharger le template vierge"}
                  </button>
                </div>
              </>
            )}

            {/* ── Erreurs ─────────────────────────────────────── */}
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

            {/* ── Upload (toujours visible) ────────────────────── */}
            <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 18, paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>
                📤 Étape finale — Uploader l'Excel complété (pour enregistrer en base)
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
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
              {uploadMsg   && <div style={{ ...s.okBox,    marginTop: 10 }}>{uploadMsg}</div>}
              {uploadError && <div style={{ ...s.errorBox, marginTop: 10 }}>{uploadError}</div>}
            </div>
          </SectionCard>

          {/* ══ Section Données importées ═══════════════════════ */}
          <SectionCard
            title={
              <span>
                Données importées
                {actions.length > 0 && (
                  <span style={{
                    marginLeft: 8, background: "#ede9fe", color: "#6d28d9",
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
                Aucune action importée. Uploadez un Excel AMUREBA complété pour en importer.
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
        </>
      )}

      {/* ── Historique drawer ────────────────────────────────── */}
      {historyOpen && (
        <HistoryDrawer
          history={history}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const spin = { animation: "spin 1s linear infinite" };

/* ── Bandeau de statut pré-rempli ───────────────────────────── */
function PrefillStatusBanner({ prefillStatus, downloading, analyzing, onDownload, onReanalyze }) {
  const dateStr = prefillStatus?.prefilled_at
    ? new Date(prefillStatus.prefilled_at).toLocaleString("fr-BE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 10,
      background: "#dcfce7", border: "1px solid #bbf7d0",
      borderRadius: 10, padding: "10px 14px", marginBottom: 16,
    }}>
      <span style={{ fontWeight: 700, fontSize: 13, color: "#166534" }}>
        ✅ Excel pré-rempli le {dateStr}
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onDownload}
          disabled={downloading}
          style={{ ...s.primaryBtn, fontSize: 12, padding: "7px 12px", opacity: downloading ? 0.7 : 1 }}
        >
          <Download size={13} />
          {downloading ? "Téléchargement…" : "Télécharger l'Excel pré-rempli"}
        </button>
        <button
          onClick={onReanalyze}
          disabled={analyzing}
          style={{ ...s.ghostBtn, fontSize: 12, padding: "7px 12px", opacity: analyzing ? 0.7 : 1 }}
          title="Relancer l'analyse IA pour améliorer l'Excel existant"
        >
          {analyzing
            ? <><RefreshCw size={12} style={spin} /> Analyse…</>
            : <><RefreshCw size={12} /> Améliorer l'Excel existant</>}
        </button>
      </div>
    </div>
  );
}

/* ── Résumé sauvegardé (mode lecture) ───────────────────────── */
function SavedSummary({ prefillStatus }) {
  const summary = prefillStatus?.prefill_summary;
  if (!summary) return null;

  // Nouveau format: { items: [...] }
  if (summary.items?.length > 0) {
    const sheets = [...new Set(summary.items.map((i) => i.sheet))];
    return (
      <div style={{ marginTop: 4, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9", marginBottom: 8 }}>
          📋 Résumé du dernier pré-remplissage
        </div>
        {sheets.map((sheet) => {
          const sheetItems = summary.items.filter((i) => i.sheet === sheet);
          return (
            <div key={sheet} style={{ marginBottom: 8, background: "#faf5ff", borderRadius: 10, padding: "10px 14px", border: "1px solid #ede9fe" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#6d28d9", marginBottom: 6 }}>{sheet}</div>
              {sheetItems.filter((i) => i.is_numeric).map((item) => (
                <div key={item.id} style={{ fontSize: 12, color: "#374151", marginBottom: 2 }}>
                  <span style={{ color: item.selected ? "#059669" : "#9ca3af" }}>
                    {item.selected ? "✅" : "⬜"}
                  </span>{" "}
                  {item.label.replace(`${sheet} → `, "")} :{" "}
                  <strong>{fmtValue(item.field, item.value)}</strong>
                  <SourceTag source={item.source} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // Ancien format: { actions: [...] }
  if (summary.actions?.length > 0) {
    return (
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        {summary.nb_actions} action(s) pré-remplie(s) — {summary.entity_name}
      </div>
    );
  }

  return null;
}

/* ── Panel checklist ────────────────────────────────────────── */
function ChecklistPanel({ items, applying, selectedCount, onToggle, onToggleAll, onApply, onClose, error }) {
  const sheets = [...new Set(items.map((i) => i.sheet))];
  const allSelected = items.length > 0 && items.every((i) => i.selected);

  return (
    <div style={{ border: "1.5px solid #ede9fe", borderRadius: 14, overflow: "hidden", marginBottom: 4 }}>
      {/* Header */}
      <div style={{
        background: "#f5f3ff", padding: "13px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#4c1d95" }}>
            ✨ Modifications proposées par IA
          </div>
          <div style={{ fontSize: 12, color: "#6d28d9", marginTop: 2 }}>
            {selectedCount} cellule{selectedCount !== 1 ? "s" : ""} cochée{selectedCount !== 1 ? "s" : ""} seront injectée{selectedCount !== 1 ? "s" : ""} dans l'Excel
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => onToggleAll(!allSelected)}
            style={{ ...s.ghostBtn, fontSize: 11, padding: "5px 10px" }}
          >
            {allSelected ? <><Square size={12} /> Tout décocher</> : <><CheckSquare size={12} /> Tout cocher</>}
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: "2px 6px", borderRadius: 6 }}
            title="Fermer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Corps — groupé par feuille */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {sheets.map((sheet) => {
          const sheetItems = items.filter((i) => i.sheet === sheet);
          const textItems = sheetItems.filter((i) => !i.is_numeric);
          const sheetNumericItems = sheetItems.filter((i) => i.is_numeric);

          // Info de contexte depuis les champs texte
          const intitule       = textItems.find((i) => i.field === "intitule")?.value || "";
          const classification = textItems.find((i) => i.field === "classification")?.value || "";
          const type           = textItems.find((i) => i.field === "type_amelioration")?.value || "";

          return (
            <div key={sheet} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              {/* Groupe header */}
              <div style={{
                background: "#fafafa", padding: "9px 14px",
                borderBottom: "1px solid #f3f4f6",
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                <span style={{ background: "#6d28d9", color: "white", fontWeight: 800, fontSize: 11, padding: "3px 9px", borderRadius: 6 }}>
                  {sheet}
                </span>
                {intitule && <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{intitule}</span>}
                {type && <span style={{ fontSize: 12, color: "#6b7280" }}>— {type}</span>}
                {classification && (
                  <span style={{
                    marginLeft: "auto",
                    background: classification === "A" ? "#dcfce7" : "#fef9c3",
                    color:      classification === "A" ? "#166534" : "#854d0e",
                    fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 20,
                  }}>
                    Classe {classification}
                  </span>
                )}
              </div>

              {/* Champs texte (lecture seule — contexte) */}
              {textItems.map((item) => (
                <ChecklistRow key={item.id} item={item} onToggle={onToggle} />
              ))}
              {/* Champs numériques */}
              {sheetNumericItems.map((item) => (
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
          style={{
            ...s.primaryBtn,
            opacity: (applying || selectedCount === 0) ? 0.6 : 1,
          }}
        >
          {applying
            ? <><RefreshCw size={14} style={spin} /> Génération…</>
            : <><Download size={14} /> Appliquer les changements sélectionnés</>}
        </button>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          {selectedCount === 0
            ? "Sélectionnez au moins une proposition pour générer l'Excel."
            : "Chaque cellule proposée par l'IA est cochable individuellement. Seules les cases cochées seront écrites dans le template Excel."}
        </div>
        {error && <div style={{ ...s.errorBox, width: "100%", marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}

/* ── Ligne de la checklist ──────────────────────────────────── */
function ChecklistRow({ item, onToggle }) {
  const label = item.label.split(" → ")[1] || item.label;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 14px",
        borderBottom: "1px solid #f9fafb",
        background: item.selected ? "white" : "#f9fafb",
        cursor: "pointer",
      }}
      onClick={() => onToggle(item.id)}
    >
      <span style={{ flexShrink: 0, color: item.selected ? "#6d28d9" : "#d1d5db", width: 18, display: "flex", justifyContent: "center" }}>
        {item.selected ? (
          <CheckSquare size={16} />
        ) : (
          <Square size={16} />
        )}
      </span>

      <input
        type="checkbox"
        checked={item.selected}
        onChange={() => onToggle(item.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Sélectionner ${label}`}
        style={{ width: 18, height: 18, accentColor: "#6d28d9", cursor: "pointer", margin: 0, flexShrink: 0 }}
      />

      {/* Cellule */}
      <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", flexShrink: 0, minWidth: 36 }}>
        {item.cell}
      </span>

      {/* Label */}
      <span style={{ fontSize: 12, color: "#374151", fontWeight: 600, flex: 1 }}>
        {label}
      </span>

      {/* Valeur */}
      <span style={{ fontSize: 12, color: "#6d28d9", fontWeight: 700, flexShrink: 0 }}>
        {fmtValue(item.field, item.value)}
      </span>

      {/* Source */}
      <SourceTag source={item.source} />

      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: item.is_numeric ? "#6d28d9" : "#6b7280",
          background: item.is_numeric ? "#f5f3ff" : "#f3f4f6",
          padding: "2px 7px",
          borderRadius: 999,
          flexShrink: 0,
        }}
      >
        {item.is_numeric ? "num" : "texte"}
      </span>
    </div>
  );
}

/* ── Tag source ─────────────────────────────────────────────── */
function SourceTag({ source }) {
  const isEstimated = !source || source.estimated || !source.document;
  return (
    <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, whiteSpace: "nowrap" }}>
      {isEstimated
        ? "🤖 IA"
        : `📄 ${source.document}${source.field ? ` → ${source.field}` : ""}`}
    </span>
  );
}

/* ── Drawer historique ──────────────────────────────────────── */
function HistoryDrawer({ history, loading, onClose }) {
  return (
    <>
      {/* Fond semi-transparent */}
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
            history.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </>
  );
}

/* ── Entrée d'historique ────────────────────────────────────── */
function HistoryEntry({ entry }) {
  const isAI = entry.action_type === "AI_PREFILL";
  const [open, setOpen] = useState(false);

  const dateStr = new Date(entry.created_at).toLocaleString("fr-BE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const items   = entry.changes?.items || [];
  const summary = entry.changes?.excel_summary;

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6" }}>
      {/* Ligne principale (cliquable pour ouvrir) */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "13px 20px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          background: open ? "#faf5ff" : "white",
        }}
      >
        <span style={{ fontSize: 18 }}>{isAI ? "🤖" : "📤"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>
            {isAI ? "Pré-remplissage IA" : "Upload manuel"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>{dateStr}</div>
        </div>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Détails */}
      {open && (
        <div style={{ padding: "8px 20px 14px", background: "#faf5ff" }}>
          {isAI && items.length > 0 ? (
            <>
              {/* Groupé par sheet */}
              {[...new Set(items.map((i) => i.sheet))].map((sheet) => {
                const sheetItems = items.filter((i) => i.sheet === sheet);
                return (
                  <div key={sheet} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#6d28d9", marginBottom: 4 }}>{sheet}</div>
                    {sheetItems.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ flexShrink: 0 }}>
                          {item.selected
                            ? <span style={{ color: "#059669" }}>✅</span>
                            : <span style={{ color: "#9ca3af" }}>⬜</span>}
                        </span>
                        <span style={{ color: "#374151", flex: 1 }}>
                          {(item.label || "").split(" → ")[1] || item.label}
                        </span>
                        <span style={{ color: "#6d28d9", fontWeight: 700 }}>
                          {fmtValue(item.field, item.value)}
                        </span>
                        <SourceTag source={item.source} />
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
          <div style={{ fontSize: 11, color: "#6d28d9", fontWeight: 700, marginBottom: 4 }}>{stat.label}</div>
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
    background: "#6d28d9", color: "white", border: "none",
    padding: "10px 16px", borderRadius: 12, fontWeight: 700,
    cursor: "pointer", display: "inline-flex", alignItems: "center",
    gap: 7, fontSize: 13,
  },
  outlineBtn: {
    background: "white", color: "#6d28d9", border: "2px solid #6d28d9",
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
    background: "#fee2e2", color: "#991b1b",
    padding: "10px 14px", borderRadius: 10,
    fontWeight: 600, fontSize: 13,
  },
  okBox: {
    background: "#dcfce7", color: "#166534",
    padding: "10px 14px", borderRadius: 10,
    fontWeight: 600, fontSize: 13,
  },
  refBadge: {
    background: "#ede9fe", color: "#6d28d9",
    fontWeight: 700, fontSize: 11,
    padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap",
  },
};
