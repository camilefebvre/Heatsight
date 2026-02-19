import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

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

function safeClone(obj) {
  return JSON.parse(JSON.stringify(obj));
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
        fontWeight: 900,
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

  const [project, setProject] = useState(null);
  const [energy, setEnergy] = useState({ years: {} }); // { years: { "2023": {...}, ... } }

  const [activeYear, setActiveYear] = useState("2023");
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadProjectAndEnergy() {
    try {
      setLoading(true);
      setError("");

      // project
      const resP = await fetch(`${API_URL}/projects`);
      if (!resP.ok) throw new Error(`GET /projects failed (${resP.status})`);
      const list = await resP.json();
      const p = list.find((x) => x.id === projectId);
      setProject(p || null);

      // energy
      const resE = await fetch(`${API_URL}/projects/${projectId}/energy-accounting`);
      if (!resE.ok) throw new Error(`GET /energy-accounting failed (${resE.status})`);
      const data = await resE.json();

      const normalized = (data && typeof data === "object") ? data : { years: {} };
      if (!normalized.years) normalized.years = {};

      // default year
      if (!normalized.years[activeYear]) {
        normalized.years[activeYear] = emptyYear(activeYear);
      }

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
    return keys.sort(); // "2021","2022","2023"
  }, [energy]);

  function ensureYear(year) {
    setEnergy((prev) => {
      const next = safeClone(prev || { years: {} });
      if (!next.years) next.years = {};
      if (!next.years[String(year)]) next.years[String(year)] = emptyYear(year);
      return next;
    });
  }

  function addYear() {
    const y = prompt("Quelle année veux-tu ajouter ? (ex: 2024)");
    if (!y) return;
    ensureYear(y);
    setActiveYear(String(y));
  }

  function updateTotal(field, value) {
    setEnergy((prev) => {
      const next = safeClone(prev);
      next.years[activeYear].totals[field] = value;
      return next;
    });
  }

  function updateNotes(value) {
    setEnergy((prev) => {
      const next = safeClone(prev);
      next.years[activeYear].notes = value;
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
        body: JSON.stringify({ year: activeYear }),
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

  if (loading) return <div style={{ color: "#6b7280" }}>Loading…</div>;
  if (!project) return <div style={{ color: "#6b7280" }}>Project not found.</div>;

  const y = energy.years?.[activeYear] || emptyYear(activeYear);

  return (
    <div style={{ maxWidth: 1100, width: "100%" }}>
      <div style={{ color: "#6b7280" }}>Projet</div>
      <h1 style={{ fontSize: 36, margin: "6px 0 6px" }}>
        Comptabilité énergétique — {project.project_name}
      </h1>
      <div style={{ color: "#6b7280" }}>
        Historique annuel (tu peux ajouter des années et importer depuis l’audit).
      </div>

      {error && (
        <div style={{ marginTop: 14, background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={card}>
        {/* Year selector */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {yearKeys.map((k) => (
            <YearButton key={k} label={k} active={k === activeYear} onClick={() => setActiveYear(k)} />
          ))}
          <button type="button" onClick={addYear} style={secondaryBtn}>+ Ajouter une année</button>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={importFromAudit} style={secondaryBtn} disabled={saving}>
            {saving ? "…" : `Importer depuis Audit (${activeYear})`}
          </button>
        </div>

        {/* Graphiques */}
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <BarChart
                title={`Répartition des consommations — ${activeYear}`}
                labels={["Élec", "Gaz", "Fuel", "Biogaz", "Util1", "Util2", "Process"]}
                values={[
                    toNum(y.totals.electricity),
                    toNum(y.totals.gas),
                    toNum(y.totals.fuel),
                    toNum(y.totals.biogas),
                    toNum(y.totals.util1),
                    toNum(y.totals.util2),
                    toNum(y.totals.process),
                ]}
                unit="(valeurs annuelles)"
            />

            <BarChart
                title="Électricité par année"
                labels={yearKeys}
                values={yearKeys.map((k) => toNum(energy.years?.[k]?.totals?.electricity))}
                unit="kWh"
            />
        </div>


        {/* Totals */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Consommations annuelles (totaux)</div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12 }}>
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
            <Field label="Utilité 1">
              <input value={y.totals.util1 ?? ""} onChange={(e) => updateTotal("util1", e.target.value)} style={inputStyle} placeholder="0" />
            </Field>
            <Field label="Utilité 2">
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* UI */
function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, color: "#6b7280" }}>{label}</span>
      {children}
    </label>
  );
}

const card = {
  marginTop: 18,
  background: "white",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
};

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

function BarChart({ title, labels, values, unit = "" }) {
  // values: number[]
  const max = Math.max(1, ...values.map((v) => (Number.isFinite(v) ? v : 0)));

  return (
    <div style={{ border: "1px solid #eef2f7", borderRadius: 14, padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>

      <div style={{ overflowX: "auto" }}>
        <svg width={Math.max(520, labels.length * 90)} height={240} role="img">
          {/* axes */}
          <line x1="40" y1="200" x2="100%" y2="200" stroke="#e5e7eb" />
          <line x1="40" y1="20" x2="40" y2="200" stroke="#e5e7eb" />

          {labels.map((lab, i) => {
            const v = Number.isFinite(values[i]) ? values[i] : 0;
            const h = Math.round((v / max) * 160); // max height = 160
            const x = 60 + i * 80;
            const y = 200 - h;

            return (
              <g key={lab}>
                {/* bar */}
                <rect x={x} y={y} width={44} height={h} rx="8" fill="#6d28d9" />
                {/* value */}
                <text x={x + 22} y={y - 8} textAnchor="middle" fontSize="12" fill="#111827" fontWeight="700">
                  {v ? formatNumber(v) : "—"}
                </text>
                {/* label */}
                <text x={x + 22} y={220} textAnchor="middle" fontSize="12" fill="#6b7280">
                  {lab}
                </text>
              </g>
            );
          })}

          {/* unit */}
          {unit ? (
            <text x="40" y="14" fontSize="12" fill="#6b7280">
              {unit}
            </text>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

function formatNumber(n) {
  // format simple (sans dépendance)
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  // si très grand -> pas de décimales, sinon 2 décimales
  const decimals = Math.abs(x) >= 100 ? 0 : 2;
  return x.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(" ", "").replace(",", ".");
  if (!s) return 0;
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}
