import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../state/ProjectContext";
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { apiFetch } from "../api";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAUFFAGE_OPTIONS = [
  { id: "gaz",        label: "Chaudière gaz",    co2: 0.205, rendement: 0.90 },
  { id: "mazout",     label: "Chaudière mazout",  co2: 0.265, rendement: 0.85 },
  { id: "bois",       label: "Chaudière bois",    co2: 0.030, rendement: 0.75 },
  { id: "pac",        label: "Pompe à chaleur",   co2: 0.056, rendement: 3.0  },
  { id: "electrique", label: "Électrique direct", co2: 0.056, rendement: 1.0  },
];

const PAROI_TYPES = ["mur", "toiture", "plancher", "cloison"];
const PAROI_TYPE_LABELS = {
  mur:      "Mur extérieur",
  toiture:  "Toiture",
  plancher: "Plancher",
  cloison:  "Cloison intérieure",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function fmt(v) {
  if (v == null) return "—";
  return Math.round(v).toLocaleString("fr-BE");
}

function fmtDec(v, dec = 2) {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function extractImpact(impacts, ...keys) {
  if (!impacts || typeof impacts !== "object") return null;
  const norm = Object.fromEntries(
    Object.entries(impacts).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const k of keys) {
    const val = norm[k.toLowerCase()];
    if (val != null) return parseFloat(val);
  }
  return null;
}

// R of a composant opaque (m²·K/W)
function getComposantR(comp) {
  const rLocal = parseFloat(comp.r_local);
  if (isFinite(rLocal) && rLocal > 0) return rLocal;
  const lambda = parseFloat(comp.lambda_local) || parseFloat(comp.lambda_lib);
  const ep = parseFloat(comp.epaisseur_cm);
  if (isFinite(lambda) && lambda > 0 && isFinite(ep) && ep > 0) {
    return (ep / 100) / lambda;
  }
  return null;
}

function calcParoiStats(paroi) {
  const S_tot = parseFloat(paroi.surface_totale);
  if (!isFinite(S_tot) || S_tot <= 0) return null;

  let s_vitree = 0;
  let ua_vitree = 0;
  let cout_vitree = 0;
  let gwp_vitree = 0;
  for (const bv of paroi.baiesVitrees) {
    const sv = parseFloat(bv.surface_vitree_m2);
    const vr = parseFloat(bv.valeur_r);
    const qty = parseFloat(bv.quantite) || 1;
    if (isFinite(sv) && sv > 0) {
      s_vitree += sv;
      if (isFinite(vr) && vr > 0) ua_vitree += sv * (1 / vr);
    }
    cout_vitree += (parseFloat(bv.prix_unit) || 0) * qty;
    gwp_vitree += (parseFloat(bv.gwp100_unit) || 0) * qty;
  }

  const s_opaque = Math.max(0, S_tot - s_vitree);

  let r_total = 0;
  let hasAllR = paroi.composantsOpaques.length > 0;
  let cout_opaque = 0;
  let gwp_opaque = 0;
  for (const co of paroi.composantsOpaques) {
    const r = getComposantR(co);
    if (r == null) { hasAllR = false; } else { r_total += r; }
    const s = parseFloat(co.surface_m2) || s_opaque;
    cout_opaque += (parseFloat(co.prix_unit) || 0) * s;
    gwp_opaque += (parseFloat(co.gwp100_unit) || 0) * s;
  }

  const u_opaque = (hasAllR && r_total > 0) ? 1 / r_total : null;
  const ua_opaque = u_opaque != null ? u_opaque * s_opaque : null;
  const ua_total = ua_opaque != null ? ua_opaque + ua_vitree : null;
  const u_moyen = ua_total != null ? ua_total / S_tot : null;
  const dep_wk = u_moyen != null ? u_moyen * S_tot : null;
  const cout = cout_opaque + cout_vitree;
  const gwp = gwp_opaque + gwp_vitree;

  return {
    r_total: hasAllR && r_total > 0 ? r_total : null,
    u_opaque,
    u_moyen,
    dep_wk,
    s_vitree,
    s_opaque,
    S_tot,
    cout: cout > 0 ? cout : null,
    gwp: gwp > 0 ? gwp : null,
  };
}

function calcBatimentStats(bat) {
  const dj = parseFloat(bat.degres_jours) || 2500;
  const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];

  let total_dep = 0;
  let allHaveDep = bat.parois.length > 0;
  let total_cout = 0;
  let total_gwp = 0;

  for (const p of bat.parois) {
    const s = calcParoiStats(p);
    if (!s || s.dep_wk == null) { allHaveDep = false; }
    else { total_dep += s.dep_wk; }
    if (s?.cout) total_cout += s.cout;
    if (s?.gwp) total_gwp += s.gwp;
  }

  const dep_wk = allHaveDep ? total_dep : null;
  const energy_kwh = dep_wk != null ? (dep_wk * dj * 24) / 1000 / ch.rendement : null;
  const co2_exploitation = energy_kwh != null ? energy_kwh * ch.co2 : null;

  return {
    dep_wk,
    energy_kwh,
    co2_exploitation,
    total_cout: total_cout > 0 ? total_cout : null,
    total_gwp: total_gwp > 0 ? total_gwp : null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectLCA() {
  const { projectId } = useParams();
  const { setSelectedProjectId } = useProject();
  useEffect(() => { setSelectedProjectId(projectId); }, [projectId]);

  const [project,         setProject]         = useState(null);
  const [error,           setError]           = useState("");
  const [batiments,       setBatiments]       = useState([]);
  const [selectedId,      setSelectedId]      = useState(null);
  const [materials,       setMaterials]       = useState([]);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [expandedParois,  setExpandedParois]  = useState(new Set());
  const [activeParoiTabs, setActiveParoiTabs] = useState({});
  const [paroiModal,      setParoiModal]      = useState(null);
  const [paroiForm,       setParoiForm]       = useState({ nom: "", surface_totale: "", type: "mur" });
  const [compModal,       setCompModal]       = useState(null);
  const [compForm,        setCompForm]        = useState({});
  const [saveStatus,      setSaveStatus]      = useState("idle"); // "idle" | "saving" | "saved"

  const saveTimerRef  = useRef(null);
  const skipNextSave  = useRef(false);  // bloque la sauvegarde lors de la réhydratation initiale
  const dataLoaded    = useRef(false);  // bloque la sauvegarde avant que le GET initial soit terminé

  useEffect(() => {
    apiFetch("/projects")
      .then((res) => res.ok ? res.json() : Promise.reject("Chargement échoué"))
      .then((list) => setProject(list.find((x) => x.id === projectId) || null))
      .catch((e) => setError(String(e)));
  }, [projectId]);

  // Chargement des bâtiments ACV depuis le backend
  useEffect(() => {
    dataLoaded.current = false;
    skipNextSave.current = false;
    apiFetch(`/projects/${projectId}/lca`)
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        dataLoaded.current = true;
        if (Array.isArray(data.batiments) && data.batiments.length > 0) {
          skipNextSave.current = true;
          setBatiments(data.batiments);
        }
      })
      .catch(() => { dataLoaded.current = true; });
  }, [projectId]);

  // Sauvegarde automatique debounce 800ms à chaque modification du state batiments
  useEffect(() => {
    if (!dataLoaded.current) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const res = await apiFetch(`/projects/${projectId}/lca/batiments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batiments }),
        });
        if (res.ok) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus("idle");
        }
      } catch {
        setSaveStatus("idle");
      }
    }, 800);

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [batiments]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureMaterials() {
    if (materialsLoaded) return;
    try {
      const res = await apiFetch("/lca/materials");
      if (res.ok) {
        setMaterials(await res.json());
        setMaterialsLoaded(true);
      }
    } catch {}
  }

  // ── Building CRUD ──────────────────────────────────────────────────────────

  function addBatiment() {
    const n = batiments.length + 1;
    setBatiments((prev) => [...prev, {
      id: newId(), nom: `Bâtiment ${n}`,
      surface_plancher: "", hauteur: "", temperature_interieure: 20,
      moyen_chauffage: "gaz", degres_jours: 2500, parois: [],
    }]);
  }

  function updateBatiment(id, field, value) {
    setBatiments((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b));
  }

  function removeBatiment(id) {
    setBatiments((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function selectBatiment(id) {
    if (selectedId === id) { setSelectedId(null); return; }
    setSelectedId(id);
    ensureMaterials();
  }

  // ── Paroi CRUD ─────────────────────────────────────────────────────────────

  function openAddParoi(batId) {
    setParoiForm({ nom: "", surface_totale: "", type: "mur" });
    setParoiModal({ batId });
  }

  function confirmAddParoi() {
    if (!paroiModal) return;
    const p = {
      id: newId(), nom: paroiForm.nom || "Paroi",
      surface_totale: paroiForm.surface_totale, type: paroiForm.type,
      composantsOpaques: [], baiesVitrees: [],
    };
    setBatiments((prev) => prev.map((b) =>
      b.id === paroiModal.batId ? { ...b, parois: [...b.parois, p] } : b
    ));
    setParoiModal(null);
  }

  function updateParoi(batId, paroiId, field, value) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) => p.id === paroiId ? { ...p, [field]: value } : p),
      }
    ));
  }

  function removeParoi(batId, paroiId) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : { ...b, parois: b.parois.filter((p) => p.id !== paroiId) }
    ));
  }

  // ── Composant CRUD ─────────────────────────────────────────────────────────

  function openAddComposant(batId, paroiId, type) {
    setCompForm({ material_id: "", quantite: "1", epaisseur_cm: "", surface_m2: "", surface_vitree_m2: "" });
    setCompModal({ batId, paroiId, type });
  }

  function confirmAddComposant() {
    if (!compModal) return;
    const { batId, paroiId, type } = compModal;
    const mat = materials.find((m) => m.id === compForm.material_id);
    if (!mat) return;

    if (type === "opaque") {
      const comp = {
        id: newId(), material_id: mat.id, material_name: mat.name,
        epaisseur_cm: compForm.epaisseur_cm,
        lambda_lib: parseFloat(mat.valeur_r) || null,
        r_lib: null, lambda_local: "", r_local: "",
        surface_m2: compForm.surface_m2,
        is_fixed: false,
        prix_unit: parseFloat(mat.prix) || 0,
        gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
        impacts: mat.impacts || {},
      };
      setBatiments((prev) => prev.map((b) =>
        b.id !== batId ? b : {
          ...b, parois: b.parois.map((p) =>
            p.id !== paroiId ? p : { ...p, composantsOpaques: [...p.composantsOpaques, comp] }
          ),
        }
      ));
    } else {
      const bv = {
        id: newId(), material_id: mat.id, material_name: mat.name,
        valeur_r: parseFloat(mat.valeur_r) || 0,
        quantite: parseFloat(compForm.quantite) || 1,
        surface_vitree_m2: compForm.surface_vitree_m2,
        is_fixed: false,
        prix_unit: parseFloat(mat.prix) || 0,
        gwp100_unit: extractImpact(mat.impacts, "gwp100", "gwp_100", "GWP100") || 0,
        impacts: mat.impacts || {},
      };
      setBatiments((prev) => prev.map((b) =>
        b.id !== batId ? b : {
          ...b, parois: b.parois.map((p) =>
            p.id !== paroiId ? p : { ...p, baiesVitrees: [...p.baiesVitrees, bv] }
          ),
        }
      ));
    }
    setCompModal(null);
  }

  function updateComposant(batId, paroiId, compId, field, value) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : {
            ...p, composantsOpaques: p.composantsOpaques.map((c) =>
              c.id === compId ? { ...c, [field]: value } : c
            ),
          }
        ),
      }
    ));
  }

  function updateBaieVitree(batId, paroiId, bvId, field, value) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : {
            ...p, baiesVitrees: p.baiesVitrees.map((bv) =>
              bv.id === bvId ? { ...bv, [field]: value } : bv
            ),
          }
        ),
      }
    ));
  }

  function removeComposant(batId, paroiId, compId, type) {
    setBatiments((prev) => prev.map((b) =>
      b.id !== batId ? b : {
        ...b, parois: b.parois.map((p) =>
          p.id !== paroiId ? p : {
            ...p,
            composantsOpaques: type === "opaque"
              ? p.composantsOpaques.filter((c) => c.id !== compId)
              : p.composantsOpaques,
            baiesVitrees: type === "vitree"
              ? p.baiesVitrees.filter((c) => c.id !== compId)
              : p.baiesVitrees,
          }
        ),
      }
    ));
  }

  function toggleParoi(paroiId) {
    setExpandedParois((prev) => {
      const next = new Set(prev);
      if (next.has(paroiId)) next.delete(paroiId); else next.add(paroiId);
      return next;
    });
  }

  function getParoiTab(paroiId) { return activeParoiTabs[paroiId] || "consommation"; }
  function setParoiTab(paroiId, tab) { setActiveParoiTabs((prev) => ({ ...prev, [paroiId]: tab })); }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!project) return <div style={{ color: "#6b7280" }}>{error || "Chargement…"}</div>;

  return (
    <div style={{ maxWidth: 1400, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#6b7280" }}>Projet</div>
        {saveStatus !== "idle" && (
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: saveStatus === "saving" ? "#9ca3af" : "#059669",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {saveStatus === "saving" ? (
              <>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                  background: "#9ca3af", animation: "pulse 1s infinite",
                }} />
                Sauvegarde…
              </>
            ) : (
              <>✓ Sauvegardé</>
            )}
          </div>
        )}
      </div>
      <h1 style={{ fontSize: 36, margin: "6px 0 6px" }}>Analyse ACV — {project.project_name}</h1>
      <div style={{ color: "#6b7280" }}>Créez des configurations de bâtiment et comparez leurs résultats.</div>

      {error && (
        <div style={{ marginTop: 12, background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button type="button" onClick={addBatiment}
          style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Plus size={15} /> Nouveau bâtiment
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {batiments.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 14,
            border: "2px dashed #e5e7eb", borderRadius: 16, marginTop: 8,
          }}>
            Aucun bâtiment — cliquez sur <strong>Nouveau bâtiment</strong> pour commencer
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {batiments.map((bat) => {
              const isSelected = bat.id === selectedId;
              const stats = calcBatimentStats(bat);
              return (
                <div key={bat.id}>
                  {/* Compact row */}
                  <div
                    onClick={() => selectBatiment(bat.id)}
                    style={{
                      ...batRow,
                      background: isSelected ? "#f5f3ff" : "white",
                      borderColor: isSelected ? "#8b5cf6" : "#eef2f7",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div style={{ color: "#6d28d9" }}>
                        {isSelected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{bat.nom}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>
                        {bat.parois.length} paroi{bat.parois.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <SmallStat label="Dép." value={stats.dep_wk != null ? `${fmt(stats.dep_wk)} W/K` : "—"} />
                      <SmallStat label="CO₂/an" value={stats.co2_exploitation != null ? `${fmt(stats.co2_exploitation)} kg` : "—"} />
                      <SmallStat label="Coût" value={stats.total_cout != null ? `${fmt(stats.total_cout)} €` : "—"} />
                    </div>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); removeBatiment(bat.id); }}
                      style={iconBtn} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Detail view */}
                  {isSelected && (
                    <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "flex-start" }}>
                      {/* Left 60% */}
                      <div style={{ flex: "0 0 60%" }}>
                        <BuildingDetail
                          bat={bat}
                          updateBatiment={updateBatiment}
                          expandedParois={expandedParois}
                          toggleParoi={toggleParoi}
                          getParoiTab={getParoiTab}
                          setParoiTab={setParoiTab}
                          openAddParoi={() => openAddParoi(bat.id)}
                          updateParoi={updateParoi}
                          removeParoi={removeParoi}
                          openAddComposant={(paroiId, type) => openAddComposant(bat.id, paroiId, type)}
                          updateComposant={updateComposant}
                          updateBaieVitree={updateBaieVitree}
                          removeComposant={removeComposant}
                        />
                      </div>
                      {/* Right 40% */}
                      <div style={{ flex: "0 0 calc(40% - 16px)" }}>
                        <ResultsWidget bat={bat} stats={stats} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Paroi Modal */}
      {paroiModal && (
        <ModalOverlay onClose={() => setParoiModal(null)}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Nouvelle paroi</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Nom">
              <input type="text" value={paroiForm.nom} autoFocus
                onChange={(e) => setParoiForm((f) => ({ ...f, nom: e.target.value }))}
                style={inputStyle} placeholder="ex : Mur sud" />
            </Field>
            <Field label="Type">
              <select value={paroiForm.type}
                onChange={(e) => setParoiForm((f) => ({ ...f, type: e.target.value }))}
                style={inputStyle}>
                {PAROI_TYPES.map((t) => <option key={t} value={t}>{PAROI_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Surface totale (m²)">
              <input type="number" min="0" step="any" value={paroiForm.surface_totale}
                onChange={(e) => setParoiForm((f) => ({ ...f, surface_totale: e.target.value }))}
                style={inputStyle} placeholder="ex : 18" />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button type="button" onClick={() => setParoiModal(null)} style={cancelBtn}>Annuler</button>
            <button type="button" onClick={confirmAddParoi} disabled={!paroiForm.nom.trim()}
              style={{ ...primaryBtn, opacity: paroiForm.nom.trim() ? 1 : 0.5 }}>
              Ajouter
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Material side panel */}
      {compModal && (
        <MaterialSidePanel
          modal={compModal} form={compForm} setForm={setCompForm}
          materials={materials} onConfirm={confirmAddComposant} onClose={() => setCompModal(null)}
        />
      )}
    </div>
  );
}

// ─── BuildingDetail ───────────────────────────────────────────────────────────

function BuildingDetail({
  bat, updateBatiment, expandedParois, toggleParoi, getParoiTab, setParoiTab,
  openAddParoi, updateParoi, removeParoi,
  openAddComposant, updateComposant, updateBaieVitree, removeComposant,
}) {
  return (
    <div style={detailCard}>
      <div style={cardTitle}>Construction du bâtiment</div>

      <div style={sectionLabel}>Paramètres énergétiques</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <Field label="Surface plancher (m²)">
          <input type="number" min="0" step="any" value={bat.surface_plancher}
            onChange={(e) => updateBatiment(bat.id, "surface_plancher", e.target.value)}
            style={inputStyle} placeholder="ex : 120" />
        </Field>
        <Field label="Hauteur (m)">
          <input type="number" min="0" step="any" value={bat.hauteur}
            onChange={(e) => updateBatiment(bat.id, "hauteur", e.target.value)}
            style={inputStyle} placeholder="ex : 2.5" />
        </Field>
        <Field label="Température cible (°C)">
          <input type="number" min="10" max="30" step="0.5" value={bat.temperature_interieure}
            onChange={(e) => updateBatiment(bat.id, "temperature_interieure", e.target.value)}
            style={inputStyle} />
        </Field>
        <Field label="Chauffage">
          <select value={bat.moyen_chauffage}
            onChange={(e) => updateBatiment(bat.id, "moyen_chauffage", e.target.value)}
            style={inputStyle}>
            {CHAUFFAGE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Degrés-jours (DJ)">
          <input type="number" min="0" value={bat.degres_jours}
            onChange={(e) => updateBatiment(bat.id, "degres_jours", e.target.value)}
            style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={sectionLabel}>Parois</div>
        <button type="button" onClick={openAddParoi}
          style={{ ...smallBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={12} /> Ajouter une paroi
        </button>
      </div>

      {bat.parois.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: 13, border: "1.5px dashed #e5e7eb", borderRadius: 10 }}>
          Aucune paroi — cliquez sur <strong>Ajouter une paroi</strong>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bat.parois.map((paroi) => {
            const isExpanded = expandedParois.has(paroi.id);
            const stats = calcParoiStats(paroi);
            const tab = getParoiTab(paroi.id);
            const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
            const dj = parseFloat(bat.degres_jours) || 2500;
            const dep_contrib = stats?.dep_wk ?? null;
            const energy_contrib = dep_contrib != null ? (dep_contrib * dj * 24) / 1000 / ch.rendement : null;
            const co2_contrib = energy_contrib != null ? energy_contrib * ch.co2 : null;
            return (
              <ParoiCard
                key={paroi.id}
                bat={bat} paroi={paroi} stats={stats}
                isExpanded={isExpanded} tab={tab}
                dep_contrib={dep_contrib} energy_contrib={energy_contrib} co2_contrib={co2_contrib}
                toggleParoi={() => toggleParoi(paroi.id)}
                setTab={(t) => setParoiTab(paroi.id, t)}
                updateParoi={(field, val) => updateParoi(bat.id, paroi.id, field, val)}
                removeParoi={() => removeParoi(bat.id, paroi.id)}
                openAddComposant={(type) => openAddComposant(paroi.id, type)}
                updateComposant={(compId, field, val) => updateComposant(bat.id, paroi.id, compId, field, val)}
                updateBaieVitree={(bvId, field, val) => updateBaieVitree(bat.id, paroi.id, bvId, field, val)}
                removeComposant={(compId, type) => removeComposant(bat.id, paroi.id, compId, type)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ParoiCard ────────────────────────────────────────────────────────────────

function ParoiCard({
  paroi, stats, isExpanded, tab,
  dep_contrib, energy_contrib, co2_contrib,
  toggleParoi, setTab, updateParoi, removeParoi,
  openAddComposant, updateComposant, updateBaieVitree, removeComposant,
}) {
  return (
    <div style={paroiCardStyle}>
      {/* Header */}
      <div onClick={toggleParoi} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
        <div style={{ color: "#6d28d9", marginTop: 2, flexShrink: 0 }}>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{paroi.nom}</span>
            <span style={{ fontSize: 11, background: "#ede9fe", color: "#6d28d9", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>
              {PAROI_TYPE_LABELS[paroi.type] || paroi.type}
            </span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {paroi.surface_totale ? `${paroi.surface_totale} m²` : "— m²"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
            <MiniStat label="R total" value={stats?.r_total != null ? `${fmtDec(stats.r_total)} m²K/W` : "—"} />
            <MiniStat label="U moyen" value={stats?.u_moyen != null ? `${fmtDec(stats.u_moyen)} W/m²K` : "—"} />
            <MiniStat label="Coût" value={stats?.cout != null ? `${fmt(stats.cout)} €` : "—"} />
            <MiniStat label="GWP100" value={stats?.gwp != null ? `${fmt(stats.gwp)} kg CO₂eq` : "—"} />
          </div>
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); removeParoi(); }}
          style={iconBtn} title="Supprimer la paroi">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div style={{ marginTop: 12 }}>
          {/* Editable header fields */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Nom">
              <input type="text" value={paroi.nom}
                onChange={(e) => updateParoi("nom", e.target.value)}
                style={{ ...inputStyle, minWidth: 100 }}
                onClick={(e) => e.stopPropagation()} />
            </Field>
            <Field label="Type">
              <select value={paroi.type}
                onChange={(e) => updateParoi("type", e.target.value)}
                style={inputStyle} onClick={(e) => e.stopPropagation()}>
                {PAROI_TYPES.map((t) => <option key={t} value={t}>{PAROI_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Surface totale (m²)">
              <input type="number" min="0" step="any" value={paroi.surface_totale}
                onChange={(e) => updateParoi("surface_totale", e.target.value)}
                style={inputStyle} onClick={(e) => e.stopPropagation()} />
            </Field>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: "flex", borderBottom: "1.5px solid #f3f4f6", marginBottom: 12 }}>
            {["consommation", "impacts"].map((t) => (
              <button key={t} type="button"
                onClick={(e) => { e.stopPropagation(); setTab(t); }}
                style={{
                  padding: "7px 16px", border: "none",
                  borderBottom: tab === t ? "2px solid #6d28d9" : "2px solid transparent",
                  background: "transparent",
                  fontWeight: tab === t ? 700 : 500, fontSize: 13,
                  color: tab === t ? "#6d28d9" : "#6b7280",
                  cursor: "pointer", marginBottom: -1.5,
                }}>
                {t === "consommation" ? "Consommation" : "Impacts"}
              </button>
            ))}
          </div>

          {tab === "consommation" && (
            <ConsommationTab
              paroi={paroi} stats={stats}
              dep_contrib={dep_contrib} energy_contrib={energy_contrib} co2_contrib={co2_contrib}
              openAddComposant={openAddComposant}
              updateComposant={updateComposant}
              updateBaieVitree={updateBaieVitree}
              removeComposant={removeComposant}
            />
          )}
          {tab === "impacts" && (
            <ImpactsTab paroi={paroi} stats={stats} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── ConsommationTab ──────────────────────────────────────────────────────────

function ConsommationTab({ paroi, stats, dep_contrib, energy_contrib, co2_contrib, openAddComposant, updateComposant, updateBaieVitree, removeComposant }) {
  return (
    <div>
      {/* Composants opaques */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={sectionLabel}>Composants opaques</div>
        <button type="button" onClick={(e) => { e.stopPropagation(); openAddComposant("opaque"); }} style={smallBtn}>
          <Plus size={11} /> Ajouter
        </button>
      </div>

      {paroi.composantsOpaques.length === 0 ? (
        <div style={emptyMsg}>Aucun composant opaque — S opaque = {stats ? `${fmtDec(stats.s_opaque, 1)} m²` : "—"}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
              <th style={th}>Matériau</th>
              <th style={th}>Ép. (cm)</th>
              <th style={th}>λ</th>
              <th style={th}>R</th>
              <th style={th}>S (m²)</th>
              <th style={{ ...th, textAlign: "center" }}>Fixe</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {paroi.composantsOpaques.map((co) => {
              const r = getComposantR(co);
              const lambdaIsCustom = co.lambda_local !== "" && co.lambda_local != null;
              const rIsCustom = co.r_local !== "" && co.r_local != null;
              return (
                <tr key={co.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={td}>{co.material_name}</td>
                  <td style={td}>
                    <input type="number" min="0" step="any" value={co.epaisseur_cm}
                      onChange={(e) => updateComposant(co.id, "epaisseur_cm", e.target.value)}
                      style={miniInput} placeholder="—" />
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input type="number" min="0" step="any"
                        value={co.lambda_local !== "" ? co.lambda_local : (co.lambda_lib ?? "")}
                        onChange={(e) => updateComposant(co.id, "lambda_local", e.target.value)}
                        style={miniInput} placeholder={co.lambda_lib ? String(co.lambda_lib) : "—"} />
                      {lambdaIsCustom && <Pencil size={10} color="#f59e0b" />}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input type="number" min="0" step="any" value={co.r_local}
                        onChange={(e) => updateComposant(co.id, "r_local", e.target.value)}
                        style={miniInput} placeholder={r != null ? fmtDec(r) : "—"} />
                      {rIsCustom && <Pencil size={10} color="#f59e0b" />}
                    </div>
                  </td>
                  <td style={td}>
                    <input type="number" min="0" step="any" value={co.surface_m2}
                      onChange={(e) => updateComposant(co.id, "surface_m2", e.target.value)}
                      style={miniInput} placeholder={stats ? fmtDec(stats.s_opaque, 1) : "—"} />
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <input type="checkbox" checked={!!co.is_fixed}
                      onChange={(e) => updateComposant(co.id, "is_fixed", e.target.checked)}
                      title="Composant fixe (non modifiable)" />
                  </td>
                  <td style={td}>
                    <button type="button" onClick={() => removeComposant(co.id, "opaque")} style={tinyIconBtn}>
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Baies vitrées */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={sectionLabel}>Baies vitrées</div>
        <button type="button" onClick={(e) => { e.stopPropagation(); openAddComposant("vitree"); }} style={smallBtn}>
          <Plus size={11} /> Ajouter
        </button>
      </div>

      {paroi.baiesVitrees.length === 0 ? (
        <div style={emptyMsg}>Aucune baie vitrée — S vitrée = 0 m²</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
              <th style={th}>Matériau</th>
              <th style={th}>R (m²K/W)</th>
              <th style={th}>Qté</th>
              <th style={th}>S vitrée (m²)</th>
              <th style={{ ...th, textAlign: "center" }}>Fixe</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {paroi.baiesVitrees.map((bv) => (
              <tr key={bv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{bv.material_name}</td>
                <td style={td}>{fmtDec(bv.valeur_r)}</td>
                <td style={td}>
                  <input type="number" min="1" value={bv.quantite}
                    onChange={(e) => updateBaieVitree(bv.id, "quantite", e.target.value)}
                    style={miniInput} />
                </td>
                <td style={td}>
                  <input type="number" min="0" step="any" value={bv.surface_vitree_m2}
                    onChange={(e) => updateBaieVitree(bv.id, "surface_vitree_m2", e.target.value)}
                    style={miniInput} placeholder="m²" />
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <input type="checkbox" checked={!!bv.is_fixed}
                    onChange={(e) => updateBaieVitree(bv.id, "is_fixed", e.target.checked)}
                    title="Composant fixe (non modifiable)" />
                </td>
                <td style={td}>
                  <button type="button" onClick={() => removeComposant(bv.id, "vitree")} style={tinyIconBtn}>
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Summary */}
      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <MiniStat label="Dép. paroi" value={dep_contrib != null ? `${fmt(dep_contrib)} W/K` : "—"} highlight />
        <MiniStat label="Énergie/an" value={energy_contrib != null ? `${fmt(energy_contrib)} kWh` : "—"} />
        <MiniStat label="CO₂/an" value={co2_contrib != null ? `${fmt(co2_contrib)} kg` : "—"} />
        <MiniStat label="S vitrée" value={stats ? `${fmtDec(stats.s_vitree, 1)} m²` : "—"} />
        <MiniStat label="S opaque" value={stats ? `${fmtDec(stats.s_opaque, 1)} m²` : "—"} />
      </div>
    </div>
  );
}

// ─── ImpactsTab ───────────────────────────────────────────────────────────────

const IMPACT_ROWS = [
  { label: "GWP100",               keys: ["gwp100", "gwp_100"],             unit: "kg CO₂eq"   },
  { label: "Acidification",        keys: ["acidification", "ap"],           unit: "mol H⁺eq"   },
  { label: "Énergie non-ren.",      keys: ["energy_nr", "penrt", "pe_nr"],   unit: "MJ"         },
  { label: "Eutrophisation",        keys: ["eutrophication", "ep", "ep_fw"], unit: "kg P eq"    },
  { label: "Écotoxicité eau douce", keys: ["ecotoxicity_fw", "ctue"],        unit: "CTUe"       },
];

function ImpactsTab({ paroi, stats }) {
  const allComps = [...paroi.composantsOpaques, ...paroi.baiesVitrees];
  if (allComps.length === 0) {
    return (
      <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
        Ajoutez des composants pour voir les impacts
      </div>
    );
  }

  function sumImpact(keys) {
    let total = 0; let hasAny = false;
    for (const co of paroi.composantsOpaques) {
      const s = parseFloat(co.surface_m2) || (stats?.s_opaque ?? 0);
      const v = extractImpact(co.impacts, ...keys);
      if (v != null) { total += v * s; hasAny = true; }
    }
    for (const bv of paroi.baiesVitrees) {
      const qty = parseFloat(bv.quantite) || 1;
      const v = extractImpact(bv.impacts, ...keys);
      if (v != null) { total += v * qty; hasAny = true; }
    }
    return hasAny ? total : null;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 14 }}>
        {IMPACT_ROWS.map((imp) => {
          const v = sumImpact(imp.keys);
          return (
            <div key={imp.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>{imp.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: v != null ? "#6d28d9" : "#d1d5db", marginTop: 2 }}>
                {v != null ? fmt(v) : "—"}
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>{imp.unit}</div>
            </div>
          );
        })}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#9ca3af", fontWeight: 600 }}>
            <th style={th}>Composant</th>
            <th style={th}>GWP100</th>
            <th style={th}>Acidif.</th>
            <th style={th}>Énergie NR</th>
          </tr>
        </thead>
        <tbody>
          {paroi.composantsOpaques.map((co) => {
            const s = parseFloat(co.surface_m2) || (stats?.s_opaque ?? 0);
            const gwp  = extractImpact(co.impacts, "gwp100", "gwp_100");
            const acid = extractImpact(co.impacts, "acidification", "ap");
            const enr  = extractImpact(co.impacts, "energy_nr", "penrt", "pe_nr");
            return (
              <tr key={co.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{co.material_name} <span style={{ color: "#9ca3af" }}>({fmtDec(s, 1)} m²)</span></td>
                <td style={td}>{gwp  != null ? fmtDec(gwp  * s, 1) : "—"}</td>
                <td style={td}>{acid != null ? fmtDec(acid * s, 3) : "—"}</td>
                <td style={td}>{enr  != null ? fmtDec(enr  * s, 1) : "—"}</td>
              </tr>
            );
          })}
          {paroi.baiesVitrees.map((bv) => {
            const qty  = parseFloat(bv.quantite) || 1;
            const gwp  = extractImpact(bv.impacts, "gwp100", "gwp_100");
            const acid = extractImpact(bv.impacts, "acidification", "ap");
            const enr  = extractImpact(bv.impacts, "energy_nr", "penrt", "pe_nr");
            return (
              <tr key={bv.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{bv.material_name} <span style={{ color: "#9ca3af" }}>(×{qty})</span></td>
                <td style={td}>{gwp  != null ? fmtDec(gwp  * qty, 1) : "—"}</td>
                <td style={td}>{acid != null ? fmtDec(acid * qty, 3) : "—"}</td>
                <td style={td}>{enr  != null ? fmtDec(enr  * qty, 1) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── ResultsWidget ────────────────────────────────────────────────────────────

function ResultsWidget({ bat, stats }) {
  const paroisStats = bat.parois.map((p) => ({ paroi: p, s: calcParoiStats(p) }));
  const ch = CHAUFFAGE_OPTIONS.find((o) => o.id === bat.moyen_chauffage) || CHAUFFAGE_OPTIONS[0];
  const dj = parseFloat(bat.degres_jours) || 2500;

  function paroiConso(s) {
    if (s?.dep_wk == null) return null;
    return (s.dep_wk * dj * 24) / 1000 / ch.rendement;
  }

  return (
    <div style={detailCard}>
      <div style={cardTitle}>Impacts globaux</div>

      {/* Section 1 — 3 cartes métriques temps réel */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <MetricCard
          label="Coût total construction"
          value={stats.total_cout != null ? `${fmt(stats.total_cout)} €` : "—"}
          color="#059669"
        />
        <MetricCard
          label="Empreinte CO₂ construction"
          value={stats.total_gwp != null ? `${fmt(stats.total_gwp)} kg CO₂eq` : "—"}
          color="#d97706"
        />
        <MetricCard
          label="CO₂ exploitation"
          value={stats.co2_exploitation != null ? `${fmt(stats.co2_exploitation)} kg/an` : "—"}
          color="#6d28d9"
        />
      </div>

      {/* Section 2 — Tableau récapitulatif par paroi */}
      {paroisStats.length > 0 && (
        <>
          <div style={{ ...sectionLabel, marginBottom: 8 }}>Récapitulatif par paroi</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
            <thead>
              <tr style={{ color: "#9ca3af", fontWeight: 600, borderBottom: "1.5px solid #f3f4f6" }}>
                <th style={th}>Paroi</th>
                <th style={{ ...th, textAlign: "right" }}>U (W/m²K)</th>
                <th style={{ ...th, textAlign: "right" }}>Dép. (W/K)</th>
                <th style={{ ...th, textAlign: "right" }}>Conso (kWh/an)</th>
                <th style={{ ...th, textAlign: "right" }}>GWP100</th>
              </tr>
            </thead>
            <tbody>
              {paroisStats.map(({ paroi, s }) => {
                const conso = paroiConso(s);
                return (
                  <tr key={paroi.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{paroi.nom}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{PAROI_TYPE_LABELS[paroi.type]}</div>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s?.u_moyen != null ? fmtDec(s.u_moyen) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s?.dep_wk != null ? fmt(s.dep_wk) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {conso != null ? fmt(conso) : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {s?.gwp != null ? fmt(s.gwp) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Section 3 — 3 cartes consommation globale avec tooltip */}
      <div style={{ ...sectionLabel, marginBottom: 8 }}>Consommation globale</div>
      <div style={{ display: "flex", gap: 8 }}>
        <TooltipCard
          label="Déperditions totales (W/K)"
          value={stats.dep_wk != null ? fmt(stats.dep_wk) : "—"}
          unit="W/K"
          tooltip="Σ(U_paroi × surface) pour toutes les parois et baies vitrées"
        />
        <TooltipCard
          label="Conso. annuelle estimée"
          value={stats.energy_kwh != null ? fmt(stats.energy_kwh) : "—"}
          unit="kWh/an"
          tooltip="Déperditions (W/K) × Degrés-jours × 24h / Rendement système"
        />
        <TooltipCard
          label="CO₂ exploitation estimé"
          value={stats.co2_exploitation != null ? fmt(stats.co2_exploitation) : "—"}
          unit="kg CO₂/an"
          tooltip="Consommation annuelle (kWh) × Facteur émission du moyen de chauffage (kg CO₂/kWh)"
        />
      </div>
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, color }) {
  const missing = value === "—";
  return (
    <div style={{ flex: 1, background: "#f9fafb", borderRadius: 10, padding: "12px 10px" }}>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: missing ? "#d1d5db" : color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

// ─── TooltipCard ──────────────────────────────────────────────────────────────

function TooltipCard({ label, value, unit, tooltip }) {
  const [hovered, setHovered] = useState(false);
  const missing = value === "—";
  return (
    <div
      style={{ position: "relative", flex: 1, background: "#f9fafb", borderRadius: 10, padding: "12px 10px", cursor: "default" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && tooltip && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 7px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#1f2937", color: "white", fontSize: 11, fontWeight: 500,
          padding: "7px 10px", borderRadius: 8, lineHeight: 1.45,
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)", zIndex: 20,
          width: 200, textAlign: "center", pointerEvents: "none",
        }}>
          {tooltip}
          <div style={{
            position: "absolute", top: "100%", left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1f2937",
          }} />
        </div>
      )}
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: missing ? "#d1d5db" : "#6d28d9" }}>{value}</div>
      {!missing && unit && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

// ─── MaterialSidePanel ────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["Mur", "Fenêtre", "Toiture", "Plancher", "Cloison", "Autre"];

function MaterialSidePanel({ modal, form, setForm, materials, onConfirm, onClose }) {
  const { type } = modal;
  const [search, setSearch] = useState("");

  const filtered = materials.filter((m) => {
    const u = (m.unit || "").toLowerCase();
    const matchUnit = type === "opaque"
      ? (u.includes("m²") || u.includes("m2") || u.includes("m³") || u.includes("m3"))
      : (u.includes("unit") || u.includes("pièce") || u.includes("piece") || u.includes("m²") || u.includes("m2"));
    const matchSearch = !search.trim() || m.name.toLowerCase().includes(search.toLowerCase());
    return matchUnit && matchSearch;
  });

  // Group by category, sorted per CATEGORY_ORDER then alphabetically
  const groups = {};
  for (const m of filtered) {
    const cat = m.category || "Autre";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  }
  const sortedCats = Object.keys(groups).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const selectedMat = materials.find((m) => m.id === form.material_id) || null;

  function selectMat(m) {
    setForm((f) => ({ ...f, material_id: m.id }));
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 900 }}
        onClick={onClose}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: "35%", minWidth: 320,
        background: "white", zIndex: 901,
        boxShadow: "-6px 0 32px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>
            {type === "opaque" ? "Composant opaque" : "Baie vitrée"}
          </div>
          <button type="button" onClick={onClose} style={{ ...tinyIconBtn, color: "#6b7280", padding: "5px" }}>
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
          <input
            type="text" autoFocus
            placeholder="Rechercher un matériau…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, fontSize: 13 }}
          />
        </div>

        {/* Scrollable material list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
          {sortedCats.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
              Aucun matériau compatible
            </div>
          )}
          {sortedCats.map((cat) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ ...sectionLabel, marginBottom: 6 }}>{cat}</div>
              {groups[cat].map((m) => {
                const isSelected = form.material_id === m.id;
                const gwp = extractImpact(m.impacts, "gwp100", "gwp_100");
                return (
                  <div
                    key={m.id}
                    onClick={() => selectMat(m)}
                    style={{
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 3,
                      background: isSelected ? "#f5f3ff" : "transparent",
                      border: `1.5px solid ${isSelected ? "#8b5cf6" : "transparent"}`,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#fafafa"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{m.name}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                      {m.valeur_r != null && (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>λ/R {m.valeur_r}</span>
                      )}
                      {m.prix != null && (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>{m.prix} €/u</span>
                      )}
                      {gwp != null && (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>GWP {fmtDec(gwp, 1)} kg CO₂eq</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Inline form — visible only when a material is selected */}
        {selectedMat && (
          <div style={{
            flexShrink: 0, borderTop: "1.5px solid #eef2f7",
            background: "#fafafa", padding: "16px 20px",
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9", marginBottom: 12 }}>
              {selectedMat.name}
            </div>
            {type === "opaque" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Épaisseur (cm)">
                  <input type="number" min="0" step="any" value={form.epaisseur_cm}
                    onChange={(e) => setForm((f) => ({ ...f, epaisseur_cm: e.target.value }))}
                    style={inputStyle} placeholder="ex : 20" autoFocus />
                </Field>
                <Field label="Surface (m²) — optionnel">
                  <input type="number" min="0" step="any" value={form.surface_m2}
                    onChange={(e) => setForm((f) => ({ ...f, surface_m2: e.target.value }))}
                    style={inputStyle} placeholder="= S paroi" />
                </Field>
              </div>
            )}
            {type === "vitree" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Quantité">
                  <input type="number" min="1" value={form.quantite}
                    onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
                    style={inputStyle} autoFocus />
                </Field>
                <Field label="Surface vitrée (m²)">
                  <input type="number" min="0" step="any" value={form.surface_vitree_m2}
                    onChange={(e) => setForm((f) => ({ ...f, surface_vitree_m2: e.target.value }))}
                    style={inputStyle} placeholder="ex : 1.5" />
                </Field>
              </div>
            )}
            <button
              type="button" onClick={onConfirm}
              style={{ ...primaryBtn, width: "100%", marginTop: 14, textAlign: "center" }}
            >
              Ajouter ce composant
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Generic UI ───────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: "white", borderRadius: 16, padding: "24px 26px", width: 440, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 100 }}>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" }}>{label}</span>
      {children}
    </label>
  );
}

function SmallStat({ label, value }) {
  const missing = value === "—";
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: missing ? "#d1d5db" : "#374151" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, highlight }) {
  const missing = value === "—";
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: missing ? "#d1d5db" : (highlight ? "#6d28d9" : "#374151") }}>{value}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const detailCard = {
  background: "white", borderRadius: 14, padding: "16px 18px",
  border: "1.5px solid #eef2f7", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const cardTitle = { fontWeight: 900, fontSize: 15, color: "#111827", marginBottom: 14 };

const batRow = {
  background: "white", borderRadius: 14, padding: "12px 16px",
  border: "1.5px solid #eef2f7", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex", alignItems: "center", gap: 12,
};

const paroiCardStyle = {
  background: "#fafafa", borderRadius: 10, padding: "10px 12px",
  border: "1px solid #e5e7eb",
};

const sectionLabel = {
  fontSize: 11, fontWeight: 700, color: "#9ca3af",
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1.5px solid #e5e7eb", outline: "none",
  fontSize: 13, color: "#111827", background: "white", boxSizing: "border-box",
};

const miniInput = {
  width: "100%", padding: "4px 6px", borderRadius: 6,
  border: "1px solid #e5e7eb", outline: "none",
  fontSize: 12, color: "#111827", background: "white", boxSizing: "border-box",
};

const primaryBtn = {
  background: "#6d28d9", color: "white", border: "none",
  padding: "10px 14px", borderRadius: 12, fontWeight: 900,
  cursor: "pointer", fontSize: 14,
};

const smallBtn = {
  background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ede9fe",
  padding: "5px 10px", borderRadius: 8, fontWeight: 700,
  cursor: "pointer", fontSize: 12,
  display: "inline-flex", alignItems: "center", gap: 5,
};

const cancelBtn = {
  background: "#f3f4f6", color: "#374151", border: "none",
  padding: "10px 14px", borderRadius: 12, fontWeight: 600,
  cursor: "pointer", fontSize: 14,
};

const iconBtn = {
  border: "1px solid #e5e7eb", background: "white", borderRadius: 8,
  padding: "5px 7px", cursor: "pointer", display: "flex",
  alignItems: "center", color: "#ef4444", flexShrink: 0,
};

const tinyIconBtn = {
  border: "none", background: "transparent", borderRadius: 6,
  padding: "3px 5px", cursor: "pointer", display: "flex",
  alignItems: "center", color: "#ef4444",
};

const emptyMsg = {
  fontSize: 12, color: "#9ca3af", textAlign: "center",
  padding: "10px 0", background: "#f9fafb",
  borderRadius: 8, marginBottom: 8,
};

const th = { textAlign: "left", padding: "4px 6px", fontWeight: 600 };
const td = { padding: "5px 6px", verticalAlign: "middle" };
