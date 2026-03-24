import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { apiFetch } from "../api";

const DOC_TYPE_LABELS = {
  facture_electricite: "Facture élec.",
  facture_gaz: "Facture gaz",
  facture_fuel: "Facture fuel",
  releve_compteur: "Relevé compteur",
  contrat: "Contrat",
  autre: "Autre",
};

const ENERGY_FIELD_MAP = {
  electricite: "electricity",
  gaz: "gas",
  fuel: "fuel",
  biogas: "biogas",
};

export default function ProjectDocuments() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();

  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [clientFiles, setClientFiles] = useState([]); // from received_files
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [docType, setDocType] = useState("autre");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [viewDoc, setViewDoc] = useState(null); // doc à visualiser

  // Extracted summary panel
  const [summary, setSummary] = useState(null); // null | { docs, auditPatch, energyPatch, reportPatch }
  const [applying, setApplying] = useState("");
  const [applyMsg, setApplyMsg] = useState("");

  const fileInputRef = useRef(null);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const [projRes, docsRes, crRes] = await Promise.all([
        apiFetch("/projects"),
        apiFetch(`/projects/${projectId}/documents`),
        apiFetch(`/client-requests?project_id=${projectId}`),
      ]);

      if (!projRes.ok) throw new Error(`GET /projects (${projRes.status})`);
      const list = await projRes.json();
      setProject(list.find((x) => x.id === projectId) || null);

      if (docsRes.ok) setDocuments(await docsRes.json());

      if (crRes.ok) {
        const crs = await crRes.json();
        const files = [];
        for (const cr of crs) {
          for (const f of cr.received_files || []) {
            files.push({ ...f, cr_id: cr.id, source: "client" });
          }
        }
        setClientFiles(files);
      }
    } catch (e) {
      setError(e.message || "Chargement échoué");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [projectId]);

  // ── Upload ──────────────────────────────────────────────────────────────────

  function handleFileChange(e) {
    setSelectedFile(e.target.files[0] || null);
    setUploadMsg("");
    e.target.value = "";
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("doc_type", docType);
      const res = await apiFetch(`/projects/${projectId}/documents`, { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Upload échoué");
      }
      const doc = await res.json();
      setDocuments((prev) => [doc, ...prev]);
      setSelectedFile(null);
      setUploadMsg("✅ Fichier uploadé");
    } catch (e) {
      setUploadMsg(`❌ ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  async function handleAnalyzeOne(docId) {
    setAnalyzingId(docId);
    try {
      const res = await apiFetch(`/projects/${projectId}/documents/${docId}/analyze`, { method: "POST" });
      if (!res.ok) throw new Error(`Analyse échouée (${res.status})`);
      const updated = await res.json();
      console.log("[analyze] résultat backend:", updated);

      // Recharger la liste complète depuis le serveur pour avoir le vrai statut
      const listRes = await apiFetch(`/projects/${projectId}/documents`);
      if (listRes.ok) {
        const freshDocs = await listRes.json();
        setDocuments(freshDocs);
        buildSummary(freshDocs);
      } else {
        // Fallback : mise à jour locale depuis la réponse analyze
        setDocuments((prev) => prev.map((d) => (d.id === docId ? updated : d)));
        buildSummary(documents.map((d) => (d.id === docId ? updated : d)));
      }
    } catch (e) {
      console.error("[analyze] erreur:", e);
    } finally {
      setAnalyzingId(null);
    }
  }

  async function handleAnalyzeAll() {
    setAnalyzingAll(true);
    try {
      const res = await apiFetch(`/projects/${projectId}/documents/analyze-all`, { method: "POST" });
      if (!res.ok) throw new Error(`Analyze-all échoué (${res.status})`);
      const data = await res.json();
      const updatedMap = {};
      for (const d of data.documents || []) updatedMap[d.id] = d;
      const merged = documents.map((d) => updatedMap[d.id] || d);
      setDocuments(merged);
      buildSummary(merged);
    } catch {
      // keep
    } finally {
      setAnalyzingAll(false);
    }
  }

  async function handleDelete(docId) {
    if (!window.confirm("Supprimer ce document ?")) return;
    const res = await apiFetch(`/projects/${projectId}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
  }

  // ── Summary builder ─────────────────────────────────────────────────────────

  function buildSummary(docs) {
    const analyzed = docs.filter((d) => d.status === "analyzed" && d.extracted_data);
    if (!analyzed.length) { setSummary(null); return; }

    // Audit invoice_meter patch (last value wins per energy type)
    const invoicePatch = {};
    for (const d of analyzed) {
      const field = ENERGY_FIELD_MAP[d.extracted_data.energie];
      if (field && d.extracted_data.consommation != null)
        invoicePatch[field] = String(d.extracted_data.consommation);
    }

    // Energy accounting patch (sum per year+energy)
    const energyByYear = {};
    for (const d of analyzed) {
      const field = ENERGY_FIELD_MAP[d.extracted_data.energie];
      const year = String(d.extracted_data.annee || "2023");
      if (!field) continue;
      if (!energyByYear[year]) energyByYear[year] = {};
      if (d.extracted_data.consommation != null) {
        energyByYear[year][field] = (energyByYear[year][field] || 0) + Number(d.extracted_data.consommation);
      }
      if (d.extracted_data.cout_total != null) {
        const costKey = `${field}_cost`;
        energyByYear[year][costKey] = (energyByYear[year][costKey] || 0) + Number(d.extracted_data.cout_total);
      }
    }

    // Report patch (first non-null value)
    const reportPatch = {};
    for (const d of analyzed) {
      const x = d.extracted_data;
      if (!reportPatch.provider_company && x.fournisseur) reportPatch.provider_company = x.fournisseur;
      if (!reportPatch.auditor_name && x.auditeur) reportPatch.auditor_name = x.auditeur;
    }

    setSummary({ count: analyzed.length, invoicePatch, energyByYear, reportPatch });
  }

  // ── Apply helpers ────────────────────────────────────────────────────────────

  async function applyToAudit() {
    setApplying("audit");
    setApplyMsg("");
    try {
      const current = await apiFetch(`/projects/${projectId}/audit`);
      const auditData = current.ok ? await current.json() : {};
      const year2023 = auditData.year2023 || {};
      const invoiceMeter = { ...(year2023.invoice_meter || {}), ...summary.invoicePatch };
      const patched = { ...auditData, year2023: { ...year2023, invoice_meter: invoiceMeter } };
      const res = await apiFetch(`/projects/${projectId}/audit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_data: patched }),
      });
      if (!res.ok) throw new Error("Échec application audit");
      setApplyMsg("✅ Données appliquées à l'Audit (onglet Factures/Compteur)");
    } catch (e) {
      setApplyMsg(`❌ ${e.message}`);
    } finally {
      setApplying("");
    }
  }

  async function applyToEnergy() {
    setApplying("energy");
    setApplyMsg("");
    try {
      const current = await apiFetch(`/projects/${projectId}/energy-accounting`);
      const energyData = current.ok ? await current.json() : { years: {} };
      const years = JSON.parse(JSON.stringify(energyData.years || {}));
      let updated = 0, skipped = 0;
      for (const [year, fields] of Object.entries(summary.energyByYear)) {
        if (!years[year]) years[year] = { year, totals: {}, notes: "" };
        const totals = years[year].totals || {};
        for (const [k, v] of Object.entries(fields)) {
          const existing = totals[k];
          if (!existing || existing === "" || existing === "0" || Number(existing) === 0) {
            totals[k] = String(v);
            updated++;
          } else {
            skipped++;
          }
        }
        years[year].totals = totals;
      }
      const res = await apiFetch(`/projects/${projectId}/energy-accounting`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energy_accounting: { years } }),
      });
      if (!res.ok) throw new Error("Échec application comptabilité");
      const parts = [];
      if (updated > 0) parts.push(`${updated} champ${updated > 1 ? "s" : ""} mis à jour`);
      if (skipped > 0) parts.push(`${skipped} ignoré${skipped > 1 ? "s" : ""} (déjà rempli${skipped > 1 ? "s" : ""})`);
      setApplyMsg(updated > 0
        ? `✅ Comptabilité mise à jour · ${parts.join(" · ")}`
        : `ℹ️ Aucun champ modifié — ${parts.join(" · ")}`);
    } catch (e) {
      setApplyMsg(`❌ ${e.message}`);
    } finally {
      setApplying("");
    }
  }

  async function applyToReport() {
    setApplying("report");
    setApplyMsg("");
    try {
      if (!Object.keys(summary.reportPatch).length) {
        setApplyMsg("ℹ️ Aucune donnée rapport extraite (fournisseur, auditeur)");
        setApplying("");
        return;
      }
      const current = await apiFetch(`/projects/${projectId}/report`);
      const reportData = current.ok ? await current.json() : {};
      const patched = { ...reportData, ...summary.reportPatch };
      const res = await apiFetch(`/projects/${projectId}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_data: patched }),
      });
      if (!res.ok) throw new Error("Échec application rapport");
      setApplyMsg("✅ Données appliquées au Rapport");
    } catch (e) {
      setApplyMsg(`❌ ${e.message}`);
    } finally {
      setApplying("");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ color: "#6b7280", padding: 24 }}>Chargement…</div>;
  if (!project) return <div style={{ color: "#6b7280", padding: 24 }}>Projet introuvable.</div>;

  /* modale de visualisation */
  if (viewDoc) {
    return <FileModal doc={viewDoc} projectId={projectId} onClose={() => setViewDoc(null)} />;
  }

  const pendingCount = documents.filter((d) => d.status === "pending" || d.status === "error").length;

  return (
    <div style={{ maxWidth: 1100, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Projet</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
        Documents — {project.project_name}
      </h1>
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        Uploadez des factures ou relevés, analysez-les avec l'IA et appliquez les données à l'audit.
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {/* ── Upload card ── */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 14 }}>
          Ajouter un document
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleFileChange} />

          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>Type de document</span>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={inputStyle}>
              {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>Fichier (PDF, JPG, PNG)</span>
            <button type="button" style={secondaryBtn} onClick={() => fileInputRef.current?.click()}>
              {selectedFile ? `📎 ${selectedFile.name}` : "Choisir un fichier…"}
            </button>
          </label>

          <button
            type="button"
            style={{ ...primaryBtn, opacity: (!selectedFile || uploading) ? 0.6 : 1 }}
            disabled={!selectedFile || uploading}
            onClick={handleUpload}
          >
            {uploading ? "Upload…" : "Uploader"}
          </button>

          {pendingCount > 0 && (
            <button
              type="button"
              style={{ ...importBtn, opacity: analyzingAll ? 0.7 : 1 }}
              disabled={analyzingAll}
              onClick={handleAnalyzeAll}
            >
              {analyzingAll ? "Analyse en cours…" : `🤖 Tout analyser (${pendingCount})`}
            </button>
          )}
        </div>

        {uploadMsg && (
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: uploadMsg.startsWith("✅") ? "#166534" : "#991b1b" }}>
            {uploadMsg}
          </div>
        )}
      </div>

      {/* ── Extracted summary panel ── */}
      {summary && (
        <div style={{ ...card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#14532d", marginBottom: 10 }}>
            Données extraites depuis {summary.count} document{summary.count > 1 ? "s" : ""}
          </div>

          {/* Preview extracted values */}
          <div style={{ fontSize: 13, color: "#166534", marginBottom: 14 }}>
            {Object.keys(summary.invoicePatch).length > 0 && (
              <div>• Factures/Compteur : {Object.entries(summary.invoicePatch).map(([k, v]) => `${k}=${v}`).join(", ")}</div>
            )}
            {Object.keys(summary.energyByYear).length > 0 && (
              <div>• Comptabilité énergie : {Object.entries(summary.energyByYear).map(([y, t]) => `${y}:(${Object.entries(t).map(([k, v]) => `${k}=${v}`).join(",")})`).join(" | ")}</div>
            )}
            {Object.keys(summary.reportPatch).length > 0 && (
              <div>• Rapport : {Object.entries(summary.reportPatch).map(([k, v]) => `${k}=${v}`).join(", ")}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              style={{ ...primaryBtn, opacity: applying ? 0.7 : 1 }}
              disabled={!!applying || !Object.keys(summary.invoicePatch).length}
              onClick={applyToAudit}
            >
              {applying === "audit" ? "Application…" : "Appliquer à l'Audit"}
            </button>
            <button
              type="button"
              style={{ ...primaryBtn, opacity: applying ? 0.7 : 1 }}
              disabled={!!applying || !Object.keys(summary.energyByYear).length}
              onClick={applyToEnergy}
            >
              {applying === "energy" ? "Application…" : "Appliquer à la Comptabilité"}
            </button>
            <button
              type="button"
              style={{ ...primaryBtn, opacity: applying ? 0.7 : 1 }}
              disabled={!!applying}
              onClick={applyToReport}
            >
              {applying === "report" ? "Application…" : "Appliquer au Rapport"}
            </button>
            <button type="button" style={secondaryBtn} onClick={() => { setSummary(null); setApplyMsg(""); }}>
              Fermer
            </button>
          </div>

          {applyMsg && (
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: applyMsg.startsWith("✅") ? "#166534" : applyMsg.startsWith("ℹ") ? "#1e40af" : "#991b1b" }}>
              {applyMsg}
            </div>
          )}
        </div>
      )}

      {/* ── Documents list ── */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 14 }}>
          Documents du projet ({documents.length + clientFiles.length})
        </div>

        {documents.length === 0 && clientFiles.length === 0 && (
          <div style={{ color: "#9ca3af", fontSize: 14, fontStyle: "italic" }}>
            Aucun document pour l'instant.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              projectId={projectId}
              analyzing={analyzingId === doc.id}
              onAnalyze={() => handleAnalyzeOne(doc.id)}
              onDelete={() => handleDelete(doc.id)}
              onDoubleClick={() => setViewDoc(doc)}
            />
          ))}

          {clientFiles.map((f, i) => (
            <div key={i} style={rowBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 20 }}>📧</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Reçu via requête client · {f.size ? `${Math.round(f.size / 1024)} Ko` : ""}
                  </div>
                </div>
              </div>
              <span style={{ ...statusPill, background: "#e0f2fe", color: "#0369a1" }}>Fichier externe</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DocumentRow ─────────────────────────────────────────────────────────────

function DocumentRow({ doc, projectId, analyzing, onAnalyze, onDelete, onDoubleClick }) {
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(""); // "" | "audit" | "energy" | "report"
  const [applyMsg, setApplyMsg] = useState("");
  const ext = doc.extracted_data;

  const energyField = ENERGY_FIELD_MAP[ext?.energie];
  const year = String(ext?.annee || "2023");

  const statusColor = {
    pending: { bg: "#fef9c3", color: "#854d0e" },
    analyzed: { bg: "#dcfce7", color: "#166534" },
    error: { bg: "#fee2e2", color: "#991b1b" },
  }[doc.status] || { bg: "#f3f4f6", color: "#6b7280" };

  const statusLabel = { pending: "En attente", analyzed: "Analysé", error: "Erreur" }[doc.status] || doc.status;

  async function applyToAudit() {
    if (!energyField || ext.consommation == null) {
      setApplyMsg("ℹ️ Énergie ou consommation non extraite");
      return;
    }
    setApplying("audit");
    setApplyMsg("");
    try {
      const current = await apiFetch(`/projects/${projectId}/audit`);
      const auditData = current.ok ? await current.json() : {};
      const year2023 = auditData.year2023 || {};
      const invoiceMeter = { ...(year2023.invoice_meter || {}), [energyField]: String(ext.consommation) };
      const fs = { [`invoice_meter.${energyField}`]: { source: "document", doc_name: doc.original_name, doc_id: doc.id } };
      const res = await apiFetch(`/projects/${projectId}/audit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_data: { ...auditData, year2023: { ...year2023, invoice_meter: invoiceMeter } }, field_sources: fs }),
      });
      if (!res.ok) throw new Error("Échec PATCH audit");
      setApplyMsg("✅ Appliqué avec succès");
    } catch (e) {
      setApplyMsg(`❌ ${e.message}`);
    } finally {
      setApplying("");
    }
  }

  async function applyToEnergy() {
    if (!energyField) {
      setApplyMsg("ℹ️ Énergie non extraite");
      return;
    }
    setApplying("energy");
    setApplyMsg("");
    try {
      const current = await apiFetch(`/projects/${projectId}/energy-accounting`);
      const energyData = current.ok ? await current.json() : { years: {} };
      const years = JSON.parse(JSON.stringify(energyData.years || {}));
      if (!years[year]) years[year] = { year, totals: {}, notes: "" };
      const totals = years[year].totals || {};
      let updated = 0, skipped = 0;

      if (ext.consommation != null) {
        const existing = totals[energyField];
        if (!existing || existing === "" || existing === "0" || Number(existing) === 0) {
          totals[energyField] = String(ext.consommation);
          updated++;
        } else {
          skipped++;
        }
      }
      if (ext.cout_total != null) {
        const costKey = `${energyField}_cost`;
        const existing = totals[costKey];
        if (!existing || existing === "" || existing === "0" || Number(existing) === 0) {
          totals[costKey] = String(ext.cout_total);
          updated++;
        } else {
          skipped++;
        }
      }

      if (updated > 0) {
        const docFs = { source: "document", doc_name: doc.original_name, doc_id: doc.id };
        years[year].field_sources = { ...(years[year].field_sources || {}), [energyField]: docFs };
      }
      years[year].totals = totals;
      const res = await apiFetch(`/projects/${projectId}/energy-accounting`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energy_accounting: { years } }),
      });
      if (!res.ok) throw new Error("Échec PATCH energy-accounting");
      const parts = [];
      if (updated > 0) parts.push(`${updated} champ${updated > 1 ? "s" : ""} mis à jour`);
      if (skipped > 0) parts.push(`${skipped} valeur${skipped > 1 ? "s" : ""} ignorée${skipped > 1 ? "s" : ""} (déjà remplie${skipped > 1 ? "s" : ""})`);
      setApplyMsg(updated > 0
        ? `✅ Appliqué · ${parts.join(" · ")}`
        : `ℹ️ Aucun champ modifié — ${parts.join(" · ")}`);
    } catch (e) {
      setApplyMsg(`❌ ${e.message}`);
    } finally {
      setApplying("");
    }
  }

  async function applyToReport() {
    setApplying("report");
    setApplyMsg("");
    try {
      const patch = {};
      const fs = {};
      const docRef = { source: "document", doc_name: doc.original_name, doc_id: doc.id };
      if (ext.fournisseur) { patch.provider_company = ext.fournisseur; fs.provider_company = docRef; }
      if (ext.auditeur) { patch.auditor_name = ext.auditeur; fs.auditor_name = docRef; }
      if (!Object.keys(patch).length) {
        setApplyMsg("ℹ️ Aucune donnée rapport dans ce document (fournisseur, auditeur)");
        setApplying("");
        return;
      }
      const current = await apiFetch(`/projects/${projectId}/report`);
      const reportData = current.ok ? await current.json() : {};
      const res = await apiFetch(`/projects/${projectId}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_data: { ...reportData, ...patch }, field_sources: fs }),
      });
      if (!res.ok) throw new Error("Échec PATCH report");
      setApplyMsg("✅ Appliqué avec succès");
    } catch (e) {
      setApplyMsg(`❌ ${e.message}`);
    } finally {
      setApplying("");
    }
  }

  async function applyAll() {
    setApplying("all");
    setApplyMsg("");
    let modules = 0, updated = 0, skipped = 0, errors = [];

    // ── Audit ──
    if (energyField && ext.consommation != null) {
      try {
        const current = await apiFetch(`/projects/${projectId}/audit`);
        const auditData = current.ok ? await current.json() : {};
        const year2023 = auditData.year2023 || {};
        const invoiceMeter = { ...(year2023.invoice_meter || {}), [energyField]: String(ext.consommation) };
        const fs = { [`invoice_meter.${energyField}`]: { source: "document", doc_name: doc.original_name, doc_id: doc.id } };
        const res = await apiFetch(`/projects/${projectId}/audit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audit_data: { ...auditData, year2023: { ...year2023, invoice_meter: invoiceMeter } }, field_sources: fs }),
        });
        if (res.ok) { modules++; updated++; }
      } catch { errors.push("Audit"); }
    }

    // ── Comptabilité ──
    if (energyField) {
      try {
        const current = await apiFetch(`/projects/${projectId}/energy-accounting`);
        const energyData = current.ok ? await current.json() : { years: {} };
        const years = JSON.parse(JSON.stringify(energyData.years || {}));
        if (!years[year]) years[year] = { year, totals: {}, notes: "" };
        const totals = years[year].totals || {};
        let u = 0, s = 0;
        if (ext.consommation != null) {
          const existing = totals[energyField];
          if (!existing || existing === "" || existing === "0" || Number(existing) === 0) { totals[energyField] = String(ext.consommation); u++; }
          else s++;
        }
        if (ext.cout_total != null) {
          const ck = `${energyField}_cost`;
          const existing = totals[ck];
          if (!existing || existing === "" || existing === "0" || Number(existing) === 0) { totals[ck] = String(ext.cout_total); u++; }
          else s++;
        }
        if (u > 0) years[year].field_sources = { ...(years[year].field_sources || {}), [energyField]: { source: "document", doc_name: doc.original_name, doc_id: doc.id } };
        years[year].totals = totals;
        updated += u; skipped += s;
        const res = await apiFetch(`/projects/${projectId}/energy-accounting`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ energy_accounting: { years } }),
        });
        if (res.ok) modules++;
      } catch { errors.push("Comptabilité"); }
    }

    // ── Rapport ──
    const patch = {};
    const fs = {};
    const docRef = { source: "document", doc_name: doc.original_name, doc_id: doc.id };
    if (ext.fournisseur) { patch.provider_company = ext.fournisseur; fs.provider_company = docRef; }
    if (ext.auditeur) { patch.auditor_name = ext.auditeur; fs.auditor_name = docRef; }
    if (Object.keys(patch).length) {
      try {
        const current = await apiFetch(`/projects/${projectId}/report`);
        const reportData = current.ok ? await current.json() : {};
        const res = await apiFetch(`/projects/${projectId}/report`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_data: { ...reportData, ...patch }, field_sources: fs }),
        });
        if (res.ok) { modules++; updated += Object.keys(patch).length; }
      } catch { errors.push("Rapport"); }
    }

    setApplying("");
    const parts = [];
    if (modules > 0) parts.push(`${modules} module${modules > 1 ? "s" : ""}`);
    if (updated > 0) parts.push(`${updated} champ${updated > 1 ? "s" : ""} mis à jour`);
    if (skipped > 0) parts.push(`${skipped} ignoré${skipped > 1 ? "s" : ""}`);
    if (errors.length) {
      setApplyMsg(`⚠️ Erreur sur : ${errors.join(", ")}`);
    } else if (modules > 0) {
      setApplyMsg(`✅ Appliqué à ${parts.join(" · ")}`);
    } else {
      setApplyMsg("ℹ️ Aucune donnée applicable depuis ce document");
    }
  }

  return (
    <div style={{ ...rowBox, cursor: "default" }} onDoubleClick={onDoubleClick} title="Double-clic pour visualiser">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
          {doc.file_type === "application/pdf" ? "📄" : "🖼️"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.original_name}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} · {new Date(doc.created_at).toLocaleDateString("fr-BE")}
          </div>

          {/* Extracted data preview + apply buttons */}
          {ext && open && (
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#f9fafb", borderRadius: 10, fontSize: 13, color: "#374151" }}>
              {ext.energie && <div><strong>Énergie :</strong> {ext.energie}</div>}
              {ext.annee && <div><strong>Année :</strong> {ext.annee}</div>}
              {ext.consommation != null && <div><strong>Consommation :</strong> {ext.consommation} {ext.unite || ""}</div>}
              {ext.cout_total != null && <div><strong>Coût total :</strong> {ext.cout_total} €</div>}
              {ext.fournisseur && <div><strong>Fournisseur :</strong> {ext.fournisseur}</div>}
              {ext.nom_client && <div><strong>Client :</strong> {ext.nom_client}</div>}
              {ext.adresse_site && <div><strong>Adresse :</strong> {ext.adresse_site}</div>}
              {ext.periode_debut && <div><strong>Période :</strong> {ext.periode_debut} → {ext.periode_fin || "?"}</div>}
              {ext.notes && <div><strong>Notes :</strong> {ext.notes}</div>}

              {/* Apply buttons */}
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{ ...applyBtn, background: "#6d28d9", color: "white", opacity: applying ? 0.7 : 1 }}
                  disabled={!!applying}
                  onClick={applyAll}
                >
                  {applying === "all" ? "…" : "✨ Appliquer partout"}
                </button>
                <button
                  type="button"
                  style={{ ...applyBtn, opacity: applying ? 0.7 : 1 }}
                  disabled={!!applying}
                  onClick={applyToAudit}
                >
                  {applying === "audit" ? "…" : "→ Audit"}
                </button>
                <button
                  type="button"
                  style={{ ...applyBtn, opacity: applying ? 0.7 : 1 }}
                  disabled={!!applying}
                  onClick={applyToEnergy}
                >
                  {applying === "energy" ? "…" : "→ Comptabilité"}
                </button>
                <button
                  type="button"
                  style={{ ...applyBtn, opacity: applying ? 0.7 : 1 }}
                  disabled={!!applying}
                  onClick={applyToReport}
                >
                  {applying === "report" ? "…" : "→ Rapport"}
                </button>
              </div>

              {applyMsg && (
                <div style={{
                  marginTop: 8, fontSize: 12, fontWeight: 700,
                  color: applyMsg.startsWith("✅") ? "#166534" : applyMsg.startsWith("ℹ") ? "#1e40af" : "#991b1b",
                }}>
                  {applyMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <span style={{ ...statusPill, background: statusColor.bg, color: statusColor.color }}>
          {statusLabel}
        </span>

        {ext && (
          <button type="button" style={iconBtn} onClick={() => setOpen((v) => !v)} title={open ? "Masquer" : "Voir les données"}>
            {open ? "▲" : "▼"}
          </button>
        )}

        {(doc.status === "pending" || doc.status === "error") && (
          <button type="button" style={{ ...importBtn, padding: "6px 10px", fontSize: 13 }} disabled={analyzing} onClick={onAnalyze}>
            {analyzing ? "…" : "🤖 Analyser"}
          </button>
        )}

        <button type="button" style={{ ...iconBtn, color: "#ef4444" }} onClick={onDelete} title="Supprimer">
          ✕
        </button>
      </div>
    </div>
  );
}

// ── FileModal ────────────────────────────────────────────────────────────────

function FileModal({ doc, projectId, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(true);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    let url = null;
    async function fetchFile() {
      try {
        const res = await apiFetch(`/projects/${projectId}/documents/${doc.id}/file`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (e) {
        setFileError(e.message || "Impossible de charger le fichier");
      } finally {
        setLoadingFile(false);
      }
    }
    fetchFile();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);

  const isImage = doc.file_type.startsWith("image/");

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white", borderRadius: 16, padding: 20, maxWidth: 960,
          width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.original_name}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: "1px solid #e5e7eb", background: "white", padding: "7px 14px", borderRadius: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            Fermer
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden", borderRadius: 10, border: "1px solid #eef2f7", minHeight: 200 }}>
          {loadingFile && (
            <div style={{ color: "#6b7280", padding: 24, textAlign: "center" }}>Chargement…</div>
          )}
          {fileError && (
            <div style={{ color: "#991b1b", padding: 24, fontWeight: 700 }}>{fileError}</div>
          )}
          {blobUrl && isImage && (
            <img
              src={blobUrl}
              alt={doc.original_name}
              style={{ maxWidth: "100%", maxHeight: "75vh", display: "block", margin: "0 auto", objectFit: "contain" }}
            />
          )}
          {blobUrl && !isImage && (
            <iframe
              src={blobUrl}
              title={doc.original_name}
              style={{ width: "100%", height: "75vh", border: "none", display: "block" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}


/* ── Styles ─────────────────────────────────────────────────────────────────── */

const card = {
  marginTop: 18,
  background: "white",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const rowBox = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 14px",
  border: "1px solid #eef2f7",
  borderRadius: 12,
  flexWrap: "wrap",
};

const errorBox = {
  marginTop: 14,
  background: "#fee2e2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 12,
  fontWeight: 700,
};

const statusPill = {
  padding: "4px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const labelStyle = { fontSize: 12, fontWeight: 600, color: "#6b7280" };

const inputStyle = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1.5px solid #e5e7eb",
  outline: "none",
  fontSize: 14,
  color: "#111827",
  background: "white",
  boxSizing: "border-box",
};

const primaryBtn = {
  background: "#6d28d9",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
  alignSelf: "flex-end",
};

const secondaryBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  color: "#111827",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const importBtn = {
  border: "1.5px solid #6d28d9",
  background: "white",
  color: "#6d28d9",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const iconBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 10,
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 13,
};

const applyBtn = {
  border: "1.5px solid #6d28d9",
  background: "white",
  color: "#6d28d9",
  padding: "5px 10px",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};
