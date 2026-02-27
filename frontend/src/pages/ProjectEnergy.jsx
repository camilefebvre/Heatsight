import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../state/ProjectContext";

const API_URL = "http://127.0.0.1:8000";

const emptyYear = (year) => ({
  year: String(year),
  totals: {
    electricity: "",
    gas: "",
    fuel: "",
    biogas: "",
    util1: "",
    util2: "",
    process: "",
  },
  notes: "",
});

const DEFAULT_PRICES = {
  electricity: 0.25,
  gas: 0.08,
  fuel: 0.95,
  biogas: 0.06,
};

const PRICE_KEYS = ["electricity", "gas", "fuel", "biogas"];

const ENERGY_LABELS = {
  electricity: "Électricité",
  gas: "Gaz naturel",
  fuel: "Fuel léger",
  biogas: "Biogaz",
};

const ENERGY_COLORS = {
  electricity: "#7C3AED",
  gas: "#2563eb",
  fuel: "#f59e0b",
  biogas: "#10b981",
};

function safeClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

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
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function YearButton({ active, label, onClick }) {
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
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export default function ProjectEnergy() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();

  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  const [project, setProject] = useState(null);
  const [energy, setEnergy] = useState({ years: {} });
  const [util1Name, setUtil1Name] = useState("Utilité 1");
  const [util2Name, setUtil2Name] = useState("Utilité 2");
  const [prices, setPrices] = useState(DEFAULT_PRICES);

  const [tab, setTab] = useState("data");
  const [activeYear, setActiveYear] = useState("2023");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addingYear, setAddingYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState("");

  async function loadProjectAndEnergy() {
    try {
      setLoading(true);
      setError("");

      const resP = await fetch(`${API_URL}/projects`);
      if (!resP.ok) throw new Error(`GET /projects failed (${resP.status})`);
      const list = await resP.json();
      const p = list.find((x) => x.id === projectId);
      setProject(p || null);

      const headers = p?.audit_data?.year2023?.utility_headers || {};
      if (headers.util1_name) setUtil1Name(headers.util1_name);
      if (headers.util2_name) setUtil2Name(headers.util2_name);

      const resE = await fetch(`${API_URL}/projects/${projectId}/energy-accounting`);
      if (!resE.ok) throw new Error(`GET /energy-accounting failed (${resE.status})`);
      const data = await resE.json();

      const normalized = data && typeof data === "object" ? data : { years: {} };
      if (!normalized.years) normalized.years = {};

      const ay = String(activeYear);
      if (!normalized.years[ay]) normalized.years[ay] = emptyYear(ay);

      setEnergy(normalized);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjectAndEnergy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const yearKeys = useMemo(() => {
    const keys = Object.keys(energy.years || {});
    return keys.sort();
  }, [energy]);

  // ── Cost calculations ──────────────────────────────────────────────────────

  const costsPerYear = useMemo(() =>
    yearKeys.map((yr) => {
      const t = energy.years?.[yr]?.totals || {};
      return PRICE_KEYS.reduce((acc, k) => {
        acc[k] = toNum(t[k]) * toNum(prices[k]);
        return acc;
      }, {});
    }),
    [yearKeys, energy, prices]
  );

  const totalCostPerYear = useMemo(() =>
    costsPerYear.map((c) => PRICE_KEYS.reduce((s, k) => s + c[k], 0)),
    [costsPerYear]
  );

  const totalCostPerEnergy = useMemo(() =>
    PRICE_KEYS.reduce((acc, k) => {
      acc[k] = costsPerYear.reduce((s, c) => s + c[k], 0);
      return acc;
    }, {}),
    [costsPerYear]
  );

  const totalCostAll = useMemo(() =>
    totalCostPerYear.reduce((s, v) => s + v, 0),
    [totalCostPerYear]
  );

  const mostExpensiveYearKey = useMemo(() => {
    if (!yearKeys.length) return null;
    const max = Math.max(...totalCostPerYear);
    return max > 0 ? yearKeys[totalCostPerYear.indexOf(max)] : null;
  }, [yearKeys, totalCostPerYear]);

  const mostExpensiveEnergyKey = useMemo(() => {
    const max = Math.max(...PRICE_KEYS.map((k) => totalCostPerEnergy[k]));
    if (max === 0) return null;
    return PRICE_KEYS.find((k) => totalCostPerEnergy[k] === max);
  }, [totalCostPerEnergy]);

  const donutData = useMemo(() =>
    PRICE_KEYS
      .map((k) => ({ label: ENERGY_LABELS[k], value: totalCostPerEnergy[k], color: ENERGY_COLORS[k] }))
      .filter((d) => d.value > 0),
    [totalCostPerEnergy]
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  function ensureYear(year) {
    setEnergy((prev) => {
      const next = safeClone(prev || { years: {} });
      if (!next.years) next.years = {};
      if (!next.years[String(year)]) next.years[String(year)] = emptyYear(year);
      return next;
    });
  }

  function confirmAddYear() {
    const y = newYearInput.trim();
    if (!y) return;
    ensureYear(y);
    setActiveYear(y);
    setNewYearInput("");
    setAddingYear(false);
  }

  function updateTotal(field, value) {
    setEnergy((prev) => {
      const next = safeClone(prev);
      if (!next.years) next.years = {};
      const ay = String(activeYear);
      if (!next.years[ay]) next.years[ay] = emptyYear(ay);
      next.years[ay].totals[field] = value;
      return next;
    });
  }

  function updateNotes(value) {
    setEnergy((prev) => {
      const next = safeClone(prev);
      if (!next.years) next.years = {};
      const ay = String(activeYear);
      if (!next.years[ay]) next.years[ay] = emptyYear(ay);
      next.years[ay].notes = value;
      return next;
    });
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`${API_URL}/projects/${projectId}/energy-accounting`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energy_accounting: energy }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Save failed");
      }
      await loadProjectAndEnergy();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function importFromAudit() {
    try {
      setSaving(true);
      setError("");
      const res = await fetch(`${API_URL}/projects/${projectId}/energy-accounting/import-from-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: String(activeYear) }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Import failed");
      }
      await loadProjectAndEnergy();
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ color: "#6b7280", padding: 24 }}>Chargement...</div>;
  if (!project) return <div style={{ color: "#6b7280", padding: 24 }}>Projet introuvable.</div>;

  const y = energy.years?.[String(activeYear)] || emptyYear(activeYear);

  const series = [
    { key: "electricity", label: "Électricité",  color: "#7C3AED" },
    { key: "gas",         label: "Gaz",          color: "#2563eb" },
    { key: "fuel",        label: "Fuel",          color: "#f59e0b" },
    { key: "biogas",      label: "Biogaz",        color: "#10b981" },
    { key: "util1",       label: util1Name,       color: "#14b8a6" },
    { key: "util2",       label: util2Name,       color: "#06b6d4" },
    { key: "process",     label: "Process",       color: "#ef4444" },
  ];

  const stackedSeries = series.map((s) => ({
    ...s,
    values: yearKeys.map((k) => toNum(energy.years?.[k]?.totals?.[s.key])),
  }));

  return (
    <div style={{ maxWidth: 1100, width: "100%" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Projet</div>
      <h1 style={{ fontSize: 34, margin: "6px 0 6px", color: "#111827" }}>
        Comptabilité énergétique &mdash; {project.project_name}
      </h1>
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        Ajoute des années, saisis les totaux et visualise les graphes globaux.
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={card}>
        {/* Tabs */}
        <div style={tabsRow}>
          <Tab label="Données" active={tab === "data"} onClick={() => setTab("data")} />
          <Tab label="Graphes" active={tab === "charts"} onClick={() => setTab("charts")} />
        </div>

        {tab === "data" && (
          <>
            {/* Year selector */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {yearKeys.map((k) => (
                <YearButton
                  key={k}
                  label={k}
                  active={k === String(activeYear)}
                  onClick={() => setActiveYear(k)}
                />
              ))}

              {addingYear ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    autoFocus
                    value={newYearInput}
                    onChange={(e) => setNewYearInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmAddYear();
                      if (e.key === "Escape") setAddingYear(false);
                    }}
                    placeholder="Ex: 2024"
                    style={{ ...inputStyle, width: 100 }}
                    maxLength={4}
                  />
                  <button type="button" onClick={confirmAddYear} style={primaryBtn}>OK</button>
                  <button type="button" onClick={() => { setAddingYear(false); setNewYearInput(""); }} style={secondaryBtn}>&#x2715;</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingYear(true)} style={secondaryBtn}>
                  + Ajouter une année
                </button>
              )}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={importFromAudit} style={importBtn} disabled={saving}>
                {saving ? "..." : `Importer depuis Audit (${activeYear})`}
              </button>
            </div>

            {/* Totals */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 10 }}>
                Consommations annuelles &mdash; {activeYear}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                <Field label="Électricité (kWh)">
                  <input value={y.totals.electricity ?? ""} onChange={(e) => updateTotal("electricity", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
                <Field label="Gaz naturel (kWh)">
                  <input value={y.totals.gas ?? ""} onChange={(e) => updateTotal("gas", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
                <Field label="Fuel léger (litres)">
                  <input value={y.totals.fuel ?? ""} onChange={(e) => updateTotal("fuel", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
                <Field label="Biogaz (kWh)">
                  <input value={y.totals.biogas ?? ""} onChange={(e) => updateTotal("biogas", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
                <Field label={util1Name}>
                  <input value={y.totals.util1 ?? ""} onChange={(e) => updateTotal("util1", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
                <Field label={util2Name}>
                  <input value={y.totals.util2 ?? ""} onChange={(e) => updateTotal("util2", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
                <Field label="Process (kgCO₂)">
                  <input value={y.totals.process ?? ""} onChange={(e) => updateTotal("process", e.target.value)} style={inputStyle} placeholder="0" />
                </Field>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <Field label="Notes (optionnel)">
                <textarea
                  rows={4}
                  value={y.notes ?? ""}
                  onChange={(e) => updateNotes(e.target.value)}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Ex: changement de chaudière, extension du bâtiment, etc."
                />
              </Field>
            </div>

            {/* Prix unitaires */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#111827", marginBottom: 4 }}>
                Prix unitaires
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                Utilisés pour le calcul des coûts dans l'onglet Graphes.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <Field label="Prix électricité (€/kWh)">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={prices.electricity}
                    onChange={(e) => setPrices((p) => ({ ...p, electricity: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Prix gaz naturel (€/kWh)">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={prices.gas}
                    onChange={(e) => setPrices((p) => ({ ...p, gas: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Prix fuel léger (€/litre)">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={prices.fuel}
                    onChange={(e) => setPrices((p) => ({ ...p, fuel: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Prix biogaz (€/kWh)">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={prices.biogas}
                    onChange={(e) => setPrices((p) => ({ ...p, biogas: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          </>
        )}

        {tab === "charts" && (
          <>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
              Graphes globaux basés sur toutes les années enregistrées.
            </div>

            {/* ── Consommations ─────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
              <StackedAreaChart
                title="Toutes les énergies par année"
                subtitle="Répartition empilée des vecteurs énergétiques"
                years={yearKeys}
                series={stackedSeries}
              />

              <LineBars
                title="Électricité par année"
                subtitle="Consommation en kWh"
                labels={yearKeys}
                values={yearKeys.map((k) => toNum(energy.years?.[k]?.totals?.electricity))}
                color="#7C3AED"
              />

              <LineBars
                title="Gaz par année"
                subtitle="Consommation en kWh"
                labels={yearKeys}
                values={yearKeys.map((k) => toNum(energy.years?.[k]?.totals?.gas))}
                color="#2563eb"
              />

              <LineBars
                title="Process par année"
                subtitle="Émissions en kgCO₂"
                labels={yearKeys}
                values={yearKeys.map((k) => toNum(energy.years?.[k]?.totals?.process))}
                color="#ef4444"
              />
            </div>

            {/* ── Analyse financière ────────────────────────────────────── */}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#111827", marginBottom: 4 }}>
                Analyse financière
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                Coûts calculés à partir des consommations et des prix unitaires renseignés dans l'onglet Données.
              </div>

              {/* Cartes récapitulatives */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
                <SummaryKpi
                  label="Coût total"
                  value={formatEuro(totalCostAll)}
                  sub="toutes années confondues"
                />
                <SummaryKpi
                  label="Année la plus coûteuse"
                  value={mostExpensiveYearKey ?? "—"}
                  sub={mostExpensiveYearKey ? formatEuro(Math.max(...totalCostPerYear)) : null}
                />
                <SummaryKpi
                  label="Énergie la plus coûteuse"
                  value={mostExpensiveEnergyKey ? ENERGY_LABELS[mostExpensiveEnergyKey] : "—"}
                  sub={mostExpensiveEnergyKey ? formatEuro(totalCostPerEnergy[mostExpensiveEnergyKey]) : null}
                  accentColor={mostExpensiveEnergyKey ? ENERGY_COLORS[mostExpensiveEnergyKey] : null}
                />
              </div>

              {/* Graphes financiers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
                <LineBars
                  title="Coût total par année"
                  subtitle="Coût énergétique total en €"
                  labels={yearKeys}
                  values={totalCostPerYear}
                  color="#6d28d9"
                  formatValue={formatEuro}
                />
                <DonutChart
                  title="Répartition des coûts par énergie"
                  subtitle="Proportion des coûts par vecteur énergétique"
                  data={donutData}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── UI helpers ─────────────────────────────────────────────────────────────── */

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{label}</span>
      {children}
    </label>
  );
}

function SummaryKpi({ label, value, sub, accentColor }) {
  return (
    <div
      style={{
        background: "#f9fafb",
        borderRadius: 12,
        padding: "14px 16px",
        border: "1px solid #f3f4f6",
        borderLeft: accentColor ? `4px solid ${accentColor}` : "1px solid #f3f4f6",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
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

const chartCard = {
  background: "white",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const tabsRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 14,
};

const errorBox = {
  marginTop: 14,
  background: "#fee2e2",
  color: "#991b1b",
  padding: 12,
  borderRadius: 12,
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
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

/* ── Charts ─────────────────────────────────────────────────────────────────── */

function LineBars({ title, subtitle, labels, values, color = "#7C3AED", formatValue }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const fmt = formatValue || formatNumber;
  const max = Math.max(1, ...values.map((v) => (Number.isFinite(v) ? v : 0)));
  const svgW = Math.max(520, labels.length * 90);

  return (
    <div style={chartCard}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{subtitle}</div>}

      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <svg width={svgW} height={240} role="img" style={{ overflow: "visible" }}>
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <line key={frac} x1="40" y1={20 + (1 - frac) * 160} x2={svgW} y2={20 + (1 - frac) * 160} stroke="#f3f4f6" strokeWidth={1} />
          ))}
          <line x1="40" y1="200" x2={svgW} y2="200" stroke="#e5e7eb" />
          <line x1="40" y1="20" x2="40" y2="200" stroke="#e5e7eb" />

          {labels.map((lab, i) => {
            const v = Number.isFinite(values[i]) ? values[i] : 0;
            const h = Math.round((v / max) * 160);
            const x = 60 + i * 80;
            const barY = 200 - h;
            const isHovered = hoveredIdx === i;

            return (
              <g key={`${lab}-${i}`}>
                <rect
                  x={x - 10} y={20} width={64} height={200}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: "default" }}
                />
                <rect x={x} y={barY} width={44} height={h} rx={4} fill={color} fillOpacity={isHovered ? 1 : 0.82} />
                <text x={x + 22} y={220} textAnchor="middle" fontSize="12" fill="#6b7280">{lab}</text>
                {isHovered && (
                  <g>
                    <rect x={x - 20} y={barY - 36} width={84} height={26} rx={6} fill="#1f2937" />
                    <text x={x + 22} y={barY - 18} textAnchor="middle" fontSize="11" fill="white" fontWeight="700">
                      {v ? fmt(v) : "\u2014"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DonutChart({ title, subtitle, data }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div style={chartCard}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{subtitle}</div>}
        <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 20, fontStyle: "italic" }}>
          Aucune donnée de coût disponible.
        </div>
      </div>
    );
  }

  const cx = 90, cy = 90, outerR = 78, innerR = 50;

  const segments = [];
  let startAngle = -Math.PI / 2;

  data.forEach((d) => {
    const fraction = d.value / total;
    const sweep = fraction * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > Math.PI ? 1 : 0;

    const cos0 = Math.cos(startAngle), sin0 = Math.sin(startAngle);
    const cos1 = Math.cos(endAngle),   sin1 = Math.sin(endAngle);

    const path = [
      `M${cx + outerR * cos0},${cy + outerR * sin0}`,
      `A${outerR},${outerR},0,${largeArc},1,${cx + outerR * cos1},${cy + outerR * sin1}`,
      `L${cx + innerR * cos1},${cy + innerR * sin1}`,
      `A${innerR},${innerR},0,${largeArc},0,${cx + innerR * cos0},${cy + innerR * sin0}`,
      "Z",
    ].join(" ");

    segments.push({ ...d, path, fraction });
    startAngle = endAngle;
  });

  return (
    <div style={chartCard}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{subtitle}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16, flexWrap: "wrap" }}>
        {/* Donut SVG */}
        <svg width={180} height={180} style={{ flexShrink: 0 }}>
          {segments.map((seg, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <path
                key={i}
                d={seg.path}
                fill={seg.color}
                fillOpacity={isHovered ? 1 : 0.82}
                stroke="white"
                strokeWidth={isHovered ? 3 : 2}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "default", transition: "fill-opacity 0.12s" }}
              />
            );
          })}
          {/* Centre */}
          <text x={cx} y={cy - 7} textAnchor="middle" fontSize="11" fontWeight="700" fill="#6b7280">Total</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="900" fill="#111827">
            {formatCompact(total)}
          </text>
        </svg>

        {/* Légende */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 130 }}>
          {segments.map((seg, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  background: isHovered ? "#f9fafb" : "transparent",
                  cursor: "default",
                  transition: "background 0.12s",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{seg.label}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {formatEuro(seg.value)} · {Math.round(seg.fraction * 100)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StackedAreaChart({ title, subtitle, years, series }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const activeSeries = series.filter((s) => s.values.some((v) => v > 0));

  const padL = 50, padR = 20, padT = 24, padB = 36;
  const chartH = 180;
  const svgH = padT + chartH + padB;
  const svgW = Math.max(560, years.length * 100 + padL + padR + 40);
  const chartW = svgW - padL - padR;

  const totals = years.map((_, i) =>
    activeSeries.reduce((sum, s) => sum + (Number.isFinite(s.values[i]) ? s.values[i] : 0), 0)
  );
  const maxVal = Math.max(1, ...totals);

  const stacked = activeSeries.map((_, si) =>
    years.map((_, yi) => {
      let cum = 0;
      for (let sj = 0; sj <= si; sj++) {
        cum += Number.isFinite(activeSeries[sj].values[yi]) ? activeSeries[sj].values[yi] : 0;
      }
      return cum;
    })
  );

  const xPos = (i) =>
    padL + (years.length <= 1 ? chartW / 2 : (i / (years.length - 1)) * chartW);
  const yPos = (v) => padT + chartH - (v / maxVal) * chartH;

  const buildPath = (si) => {
    const tops = stacked[si];
    const bottoms = si === 0 ? years.map(() => 0) : stacked[si - 1];

    if (years.length === 1) {
      const x = xPos(0);
      const hw = 24;
      return [
        `M${x - hw},${yPos(tops[0])}`,
        `L${x + hw},${yPos(tops[0])}`,
        `L${x + hw},${yPos(bottoms[0])}`,
        `L${x - hw},${yPos(bottoms[0])}`,
        "Z",
      ].join(" ");
    }

    const fwd = years.map((_, i) => `${xPos(i)},${yPos(tops[i])}`);
    const bwd = [...years].map((_, i) => {
      const ri = years.length - 1 - i;
      return `${xPos(ri)},${yPos(bottoms[ri])}`;
    });

    return [`M${fwd[0]}`, ...fwd.slice(1).map((p) => `L${p}`), ...bwd.map((p) => `L${p}`), "Z"].join(" ");
  };

  return (
    <div style={chartCard}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{subtitle}</div>}

      {activeSeries.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {activeSeries.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block", opacity: 0.85 }} />
              <span style={{ fontWeight: 600 }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <svg width={svgW} height={svgH} role="img" style={{ overflow: "visible" }}>
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <line
              key={frac}
              x1={padL} y1={padT + (1 - frac) * chartH}
              x2={svgW - padR} y2={padT + (1 - frac) * chartH}
              stroke="#f3f4f6" strokeWidth={1}
            />
          ))}
          <line x1={padL} y1={padT + chartH} x2={svgW - padR} y2={padT + chartH} stroke="#e5e7eb" />
          <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#e5e7eb" />

          {activeSeries.map((s, si) => (
            <path key={s.key} d={buildPath(si)} fill={s.color} fillOpacity={0.72} />
          ))}

          {years.map((yr, i) => {
            const x = xPos(i);
            const isHovered = hoveredIdx === i;

            return (
              <g key={yr}>
                <rect
                  x={x - 30} y={padT} width={60} height={chartH + 16}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: "default" }}
                />
                {isHovered && (
                  <line x1={x} y1={padT} x2={x} y2={padT + chartH} stroke="#6b7280" strokeWidth={1} strokeDasharray="4,3" />
                )}
                <text x={x} y={svgH - 6} textAnchor="middle" fontSize="12" fill="#6b7280">{yr}</text>
                {isHovered && totals[i] > 0 && (
                  <g>
                    <rect x={x - 40} y={padT - 34} width={80} height={26} rx={6} fill="#1f2937" />
                    <text x={x} y={padT - 16} textAnchor="middle" fontSize="11" fill="white" fontWeight="700">
                      {formatNumber(totals[i])}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ── Utils ─────────────────────────────────────────────────────────────────── */

function formatNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const decimals = Math.abs(x) >= 100 ? 0 : 2;
  return x.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function formatEuro(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0 €";
  return x.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatCompact(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0 €";
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M €`;
  if (x >= 1_000) return `${Math.round(x / 1_000)}k €`;
  return `${Math.round(x)} €`;
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(" ", "").replace(",", ".");
  if (!s) return 0;
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}
