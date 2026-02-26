import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../state/ProjectContext";

const API_URL = "http://127.0.0.1:8000";

const emptyEnergyRow = {
  name: "",
  electricity: "",
  gas: "",
  fuel: "",
  biogas: "",
  util1: "",
  util2: "",
  process: "",
};

const emptyInfluenceRow = { description: "", value: "", unit: "" };

function safeClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export default function ProjectAudit() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();

  // Sync le context sidebar si on arrive directement sur l'URL
  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  const [project, setProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("energies"); // energies | influence | invoices | indices

  // ✅ Indices
  const [indices, setIndices] = useState(null);
  const [indicesLoading, setIndicesLoading] = useState(false);
  const [indicesError, setIndicesError] = useState("");

  const [audit, setAudit] = useState({
    year2023: {
      utility_headers: {
        util1_name: "",
        util1_unit: "",
        util2_name: "",
        util2_unit: "",
      },
      operational: [{ ...emptyEnergyRow }],
      buildings: [{ ...emptyEnergyRow }],
      transport: [{ ...emptyEnergyRow }],
      utility: [{ ...emptyEnergyRow }],

      influence_factors: [{ ...emptyInfluenceRow }],

      invoice_meter: {
        electricity: "",
        gas: "",
        fuel: "",
        biogas: "",
        util1: "",
        util2: "",
        process: "",
      },
    },
  });

  const sections = useMemo(
    () => [
      { key: "operational", title: "Activité opérationnelle" },
      { key: "buildings", title: "Bâtiments" },
      { key: "transport", title: "Transport" },
      { key: "utility", title: "Utilité" },
    ],
    []
  );

  async function load() {
    try {
      setError("");
      const res = await fetch(`${API_URL}/projects`);
      if (!res.ok) throw new Error(`GET /projects failed (${res.status})`);
      const list = await res.json();
      const p = list.find((x) => x.id === projectId);
      setProject(p || null);

      if (p?.audit_data) {
        setAudit((prev) => {
          const next = safeClone(prev);
          return { ...next, ...p.audit_data };
        });
      }
    } catch (e) {
      setError(e.message || "Load failed");
      setProject(null);
    }
  }

  async function loadIndices() {
    try {
      setIndicesError("");
      setIndicesLoading(true);

      const res = await fetch(`${API_URL}/projects/${projectId}/indices`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `GET /indices failed (${res.status})`);
      }

      const data = await res.json();
      setIndices(data);
    } catch (e) {
      setIndices(null);
      setIndicesError(e.message || "Impossible de charger les indices");
    } finally {
      setIndicesLoading(false);
    }
  }


  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ✅ charge les indices quand on va sur l'onglet
  useEffect(() => {
    if (tab === "indices") loadIndices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function updateHeader(key, value) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023.utility_headers[key] = value;
      return next;
    });
  }

  function updateEnergyRow(sectionKey, idx, field, value) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023[sectionKey][idx][field] = value;
      return next;
    });
  }

  function addEnergyRow(sectionKey) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023[sectionKey].push({ ...emptyEnergyRow });
      return next;
    });
  }

  function removeEnergyRow(sectionKey, idx) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023[sectionKey].splice(idx, 1);
      if (next.year2023[sectionKey].length === 0) next.year2023[sectionKey].push({ ...emptyEnergyRow });
      return next;
    });
  }

  // Influence (L/M/N)
  function updateInfluenceRow(idx, field, value) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023.influence_factors[idx][field] = value;
      return next;
    });
  }
  function addInfluenceRow() {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023.influence_factors.push({ ...emptyInfluenceRow });
      return next;
    });
  }
  function removeInfluenceRow(idx) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023.influence_factors.splice(idx, 1);
      if (next.year2023.influence_factors.length === 0) next.year2023.influence_factors.push({ ...emptyInfluenceRow });
      return next;
    });
  }

  // Invoice row (C19..I19)
  function updateInvoice(field, value) {
    setAudit((prev) => {
      const next = safeClone(prev);
      next.year2023.invoice_meter[field] = value;
      return next;
    });
  }

  async function save() {
    try {
      setSaving(true);
      setError("");

      const res = await fetch(`${API_URL}/projects/${projectId}/audit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_data: audit }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Save failed");
      }

      await load();

      // ✅ si tu es sur l'onglet indices, on refresh aussi
      if (tab === "indices") await loadIndices();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div>
        <h1 style={{ fontSize: 34, margin: "6px 0 0" }}>Audit</h1>
        <div style={{ marginTop: 14, background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 700 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!project) return <div style={{ color: "#6b7280" }}>Loading audit…</div>;

  const util1Name = audit.year2023.utility_headers.util1_name || "Utilité 1";
  const util2Name = audit.year2023.utility_headers.util2_name || "Utilité 2";

  return (
    <div style={{ maxWidth: 1200, width: "100%" }}>
      <div style={{ color: "#6b7280" }}>Projet</div>
      <h1 style={{ fontSize: 36, margin: "6px 0 6px" }}>Audit — {project.project_name}</h1>
      <div style={{ color: "#6b7280" }}>
        Les données ci-dessous mettent à jour le template Excel (sheet 2023).
      </div>

      <div style={card}>
        {/* Tabs */}
        <div style={tabsRow}>
          <Tab label="Énergies" active={tab === "energies"} onClick={() => setTab("energies")} />
          <Tab label="Facteurs d'influence" active={tab === "influence"} onClick={() => setTab("influence")} />
          <Tab label="Factures / Compteur" active={tab === "invoices"} onClick={() => setTab("invoices")} />
          <Tab label="Indices" active={tab === "indices"} onClick={() => setTab("indices")} />
        </div>

        {tab === "energies" && (
          <>
            {/* Avertissement si une section dépasse 2 lignes (limite du template Excel) */}
            {sections.some((s) => (audit.year2023[s.key] || []).length > 2) && (
              <div style={{ marginBottom: 14, background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", padding: "10px 14px", borderRadius: 12, fontSize: 13 }}>
                ⚠️ Le template Excel supporte max <strong>2 lignes par section</strong>. Les lignes supplémentaires sont sauvegardées ici mais ne seront pas écrites dans l'Excel (et n'impacteront pas les indices).
              </div>
            )}

            {/* Utility headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <MiniCard title="Utilité 1">
                <Field label="Nom">
                  <input value={audit.year2023.utility_headers.util1_name} onChange={(e) => updateHeader("util1_name", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Unité">
                  <input value={audit.year2023.utility_headers.util1_unit} onChange={(e) => updateHeader("util1_unit", e.target.value)} style={inputStyle} />
                </Field>
              </MiniCard>

              <MiniCard title="Utilité 2">
                <Field label="Nom">
                  <input value={audit.year2023.utility_headers.util2_name} onChange={(e) => updateHeader("util2_name", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Unité">
                  <input value={audit.year2023.utility_headers.util2_unit} onChange={(e) => updateHeader("util2_unit", e.target.value)} style={inputStyle} />
                </Field>
              </MiniCard>
            </div>

            {/* Sections */}
            {sections.map((s) => (
              <EnergySection
                key={s.key}
                title={s.title}
                rows={audit.year2023[s.key] || []}
                util1Label={util1Name}
                util2Label={util2Name}
                onAdd={() => addEnergyRow(s.key)}
                onRemove={(idx) => removeEnergyRow(s.key, idx)}
                onChange={(idx, field, value) => updateEnergyRow(s.key, idx, field, value)}
              />
            ))}
          </>
        )}

        {tab === "influence" && (
          <div style={{ marginTop: 14 }}>
            <h3 style={h3}>Facteurs d'influence</h3>
            <SmallTable
              headers={["Description", "Valeur", "Unité", ""]}
              rows={audit.year2023.influence_factors}
              renderRow={(r, idx) => (
                <>
                  <td style={td}><input value={r.description || ""} onChange={(e) => updateInfluenceRow(idx, "description", e.target.value)} style={inputStyle} /></td>
                  <td style={td}><input value={r.value || ""} onChange={(e) => updateInfluenceRow(idx, "value", e.target.value)} style={inputStyle} placeholder="0" /></td>
                  <td style={td}><input value={r.unit || ""} onChange={(e) => updateInfluenceRow(idx, "unit", e.target.value)} style={inputStyle} /></td>
                  <td style={{ ...td, width: 50 }}>
                    <button type="button" style={iconBtn} onClick={() => removeInfluenceRow(idx)} title="Supprimer">✕</button>
                  </td>
                </>
              )}
            />
            <button type="button" onClick={addInfluenceRow} style={{ ...primaryBtn, marginTop: 10 }}>+ Ajouter une ligne</button>
          </div>
        )}

        {tab === "invoices" && (
          <div style={{ marginTop: 14 }}>
            <h3 style={h3}>Factures / Compteur entrée</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Électricité">
                <input value={audit.year2023.invoice_meter.electricity} onChange={(e) => updateInvoice("electricity", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Gaz naturel">
                <input value={audit.year2023.invoice_meter.gas} onChange={(e) => updateInvoice("gas", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Fuel léger">
                <input value={audit.year2023.invoice_meter.fuel} onChange={(e) => updateInvoice("fuel", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>

              <Field label="Biogaz">
                <input value={audit.year2023.invoice_meter.biogas} onChange={(e) => updateInvoice("biogas", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>
              <Field label={util1Name}>
                <input value={audit.year2023.invoice_meter.util1} onChange={(e) => updateInvoice("util1", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>
              <Field label={util2Name}>
                <input value={audit.year2023.invoice_meter.util2} onChange={(e) => updateInvoice("util2", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>

              <Field label="Process">
                <input value={audit.year2023.invoice_meter.process} onChange={(e) => updateInvoice("process", e.target.value)} style={inputStyle} placeholder="0" />
              </Field>
            </div>
          </div>
        )}

        {tab === "indices" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ ...h3, margin: 0 }}>Indices (lus depuis l'Excel)</h3>
              <button type="button" onClick={loadIndices} style={secondaryBtn} disabled={indicesLoading}>
                {indicesLoading ? "Chargement…" : "Rafraîchir"}
              </button>
            </div>

            {indicesError && (
              <div style={{ marginTop: 12, background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 700 }}>
                {indicesError}
              </div>
            )}

            {!indicesError && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <MiniCard title="Indices principaux">
                  <IndexRow label="IEE" value={indices?.primary?.IEE} format={formatPercent} />
                  <IndexRow label="Intensité Carbone (IC)" value={indices?.primary?.IC} format={formatIntNoDecimals} />
                  <IndexRow label="iSER" value={indices?.primary?.iSER} format={formatPercent} />
                </MiniCard>

                <MiniCard title="Indices secondaires">
                  <IndexRow label="AEE" value={indices?.secondary?.AEE} format={formatPercent} />
                  <IndexRow label="iCO₂" value={indices?.secondary?.iCO2} format={formatPercent} />
                  <IndexRow label="ACO₂" value={indices?.secondary?.ACO2} format={formatPercent} />
                </MiniCard>

              </div>
            )}

            <div style={{ marginTop: 12, color: "#6b7280", fontSize: 12 }}>
              Remarque : si ces cellules proviennent de formules, il faut que l'Excel ait été calculé et sauvegardé pour que la valeur apparaisse ici.
            </div>
          </div>
        )}

        {/* Actions (always visible) */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, gap: 12, flexWrap: "wrap" }}>
          <a href={`${API_URL}/projects/${projectId}/excel`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <button style={secondaryBtn}>⬇️ Télécharger Excel</button>
          </a>

          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- UI components ---------------- */

function Tab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: active ? "#6d28d9" : "white",
        color: active ? "white" : "#111827",
        fontWeight: 900,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function MiniCard({ title, children }) {
  return (
    <div style={{ border: "1px solid #eef2f7", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
      {children}
    </label>
  );
}

function SmallTable({ headers, rows, renderRow }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #eef2f7", borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 13, background: "#fafafa" }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} style={{ borderTop: "1px solid #eef2f7" }}>
              {renderRow(r, idx)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnergySection({ title, rows, util1Label, util2Label, onAdd, onRemove, onChange }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>

      <div style={{ overflowX: "auto", border: "1px solid #eef2f7", borderRadius: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 13, background: "#fafafa" }}>
              <th style={{ padding: 10, minWidth: 220 }}>Nom</th>
              <th style={{ padding: 10, minWidth: 120 }}>Élec</th>
              <th style={{ padding: 10, minWidth: 120 }}>Gaz</th>
              <th style={{ padding: 10, minWidth: 120 }}>Fuel</th>
              <th style={{ padding: 10, minWidth: 120 }}>Biogaz</th>
              <th style={{ padding: 10, minWidth: 120 }}>{util1Label}</th>
              <th style={{ padding: 10, minWidth: 120 }}>{util2Label}</th>
              <th style={{ padding: 10, minWidth: 140 }}>Process</th>
              <th style={{ padding: 10, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #eef2f7" }}>
                {["name","electricity","gas","fuel","biogas","util1","util2","process"].map((field) => (
                  <td key={field} style={{ padding: 10 }}>
                    <input
                      value={r[field] ?? ""}
                      onChange={(e) => onChange(idx, field, e.target.value)}
                      style={inputStyle}
                      placeholder={field === "name" ? "Nom…" : "0"}
                    />
                  </td>
                ))}
                <td style={{ padding: 10 }}>
                  <button type="button" style={iconBtn} onClick={() => onRemove(idx)} title="Supprimer">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={onAdd} style={{ ...primaryBtn, marginTop: 10 }}>
        + Ajouter une ligne
      </button>
    </div>
  );
}

function isNumberLike(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n);
}

function toNumber(v) {
  return Number(String(v).replace(",", "."));
}

function formatPercent(v) {
  if (!isNumberLike(v)) return "—";
  const n = toNumber(v);

  // Excel renvoie souvent 0.96 pour 96% → on convertit
  const pct = n <= 1 ? n * 100 : n;

  // pas de décimales (tu peux mettre 1 si tu veux)
  return `${Math.round(pct)}%`;
}

function formatIntNoDecimals(v) {
  if (!isNumberLike(v)) return "—";
  return `${Math.round(toNumber(v))}`;
}

function IndexRow({ label, value, format }) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : format
      ? format(value)
      : String(value);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 800 }}>
      <div style={{ color: "#111827" }}>{label}</div>
      <div style={{ color: "#111827" }}>{display}</div>
    </div>
  );
}



/* ---------------- Styles ---------------- */

const card = {
  marginTop: 18,
  background: "white",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
};

const tabsRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 14,
};

const h3 = { margin: "0 0 10px", fontSize: 16 };

const td = { padding: 10 };

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  fontSize: 14,
};

const primaryBtn = {
  background: "#6d28d9",
  color: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  padding: "10px 14px",
  borderRadius: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const iconBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 900,
};
