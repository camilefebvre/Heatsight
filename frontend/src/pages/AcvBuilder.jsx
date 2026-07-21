import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Minus, Plus, Maximize, Undo2, Redo2, Trash2, RotateCcw, RotateCw, Check } from "lucide-react";
import {
  makeProjection,
  groundToScreen,
  screenToGround,
  snap,
  isRectilinear,
  translatePolygon,
  unionRectilinear,
  edgeLength,
  rotatePolygon90,
  resizeEdge,
  flattenUnion,
} from "../utils/acvbuilder-geometry.js";

// Module ACV 3D — constructeur visuel (POC).
// On assemble des briques rectilignes (rect, L, U, T) qui fusionnent quand elles
// se touchent. « Fusionner l'emprise » réduit l'assemblage à UNE forme unique ;
// dès qu'il n'y a qu'une forme, chaque mur est coté et modifiable au clic.
// On peut toujours ré-ajouter / déplacer / pivoter des formes ensuite. Étape 3D après.

const HS_PURPLE = "#59169c";
const RED = "#dc2626";
const VIEW_W = 800;
const VIEW_H = 460;
const SNAP_M = 0.1;
const GRID_M = 1;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.2;
const EPS = 1e-9;

const RECT = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }];

const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
const fmt = (n) => n.toFixed(1).replace(".", ",");

// Nombre de mètres « rond » (1/2/5 × 10ⁿ) pour une longueur cible à l'écran -> barre d'échelle.
function niceScaleMeters(targetPx, pxPerM) {
  const raw = targetPx / pxPerM;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let best = pow;
  for (const c of [1, 2, 5, 10]) if (c * pow <= raw) best = c * pow;
  return best;
}

function samePoints(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}
function sameShapes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((s, i) => samePoints(s, b[i]));
}
function bboxOf(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Déplace un coin en gardant les deux arêtes incidentes orthogonales.
function orthDragVertex(pts, i, x, y) {
  const n = pts.length;
  const out = pts.map((p) => ({ ...p }));
  const oldX = out[i].x;
  const oldY = out[i].y;
  out[i].x = x;
  out[i].y = y;
  const prev = out[(i - 1 + n) % n];
  const next = out[(i + 1) % n];
  if (Math.abs(prev.x - oldX) < EPS) prev.x = x;
  else if (Math.abs(prev.y - oldY) < EPS) prev.y = y;
  if (Math.abs(next.x - oldX) < EPS) next.x = x;
  else if (Math.abs(next.y - oldY) < EPS) next.y = y;
  return out;
}

const TEMPLATES = [
  { key: "rect", label: "Rectangle", pts: RECT },
  { key: "L", label: "L", pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 }] },
  { key: "U", label: "U", pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 8 }, { x: 0, y: 8 }] },
  { key: "T", label: "T", pts: [{ x: 4.5, y: 0 }, { x: 7.5, y: 0 }, { x: 7.5, y: 6 }, { x: 12, y: 6 }, { x: 12, y: 9 }, { x: 0, y: 9 }, { x: 0, y: 6 }, { x: 4.5, y: 6 }] },
];

function thumb(points, w, h) {
  const pad = 4;
  const b = bboxOf(points);
  const gw = b.maxX - b.minX || 1;
  const gh = b.maxY - b.minY || 1;
  const s = Math.min((w - 2 * pad) / gw, (h - 2 * pad) / gh);
  const offX = (w - s * gw) / 2;
  const offY = (h - s * gh) / 2;
  return points
    .map((p) => `${(offX + s * (p.x - b.minX)).toFixed(1)},${(h - offY - s * (p.y - b.minY)).toFixed(1)}`)
    .join(" ");
}

function buildProjection(flat, zoom, pan) {
  const unit = makeProjection({ scale: 1, tilt: 0 });
  const u = flat.map((p) => groundToScreen(unit, p.x, p.y));
  const ub = bboxOf(u);
  const bw = ub.maxX - ub.minX || 1;
  const bh = ub.maxY - ub.minY || 1;
  const scale = Math.min((VIEW_W * 0.78) / bw, (VIEW_H * 0.72) / bh) * zoom;
  const p0 = makeProjection({ scale, tilt: 0 });
  const s = flat.map((p) => groundToScreen(p0, p.x, p.y));
  const sb = bboxOf(s);
  const originX = (VIEW_W - (sb.minX + sb.maxX)) / 2 + pan.x;
  const originY = (VIEW_H - (sb.minY + sb.maxY)) / 2 + pan.y;
  return makeProjection({ scale, tilt: 0, originX, originY });
}

export default function AcvBuilder() {
  const { projectId } = useParams(); // eslint-disable-line no-unused-vars
  const svgRef = useRef(null);
  const panStart = useRef(null);

  const [shapes, setShapes] = useState([RECT]);
  const [active, setActive] = useState(0);
  const [hist, setHist] = useState({ stack: [[RECT]], i: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null);
  const [frozenProj, setFrozenProj] = useState(null);
  const [editEdge, setEditEdge] = useState(null);      // { index, value } — édition d'un mur
  const [fitPts, setFitPts] = useState(RECT);          // référence de cadrage figée (pas d'auto-zoom)

  const canUndo = hist.i > 0;
  const canRedo = hist.i < hist.stack.length - 1;
  const single = shapes.length === 1;                  // une seule forme -> murs éditables

  function commit(next) {
    setShapes(next);
    setHist((h) => {
      if (sameShapes(next, h.stack[h.i])) return h;
      const stack = h.stack.slice(0, h.i + 1);
      stack.push(next);
      return { stack, i: stack.length - 1 };
    });
  }
  function restore(i) {
    const snap2 = hist.stack[i];
    setShapes(snap2);
    setHist({ stack: hist.stack, i });
    setActive((a) => Math.min(a, snap2.length - 1));
    setSelected(null);
    setEditEdge(null);
  }
  function undo() { if (hist.i > 0) restore(hist.i - 1); }
  function redo() { if (hist.i < hist.stack.length - 1) restore(hist.i + 1); }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setZoom((z) => clampZoom(z * factor));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const allPts = shapes.flat();
  const dragging = drag && (drag.kind === "vertex" || drag.kind === "shape");
  const proj = dragging && frozenProj ? frozenProj : buildProjection(fitPts, zoom, pan);
  const g2s = (p) => groundToScreen(proj, p.x, p.y);
  const scaleM = niceScaleMeters(110, proj.scale);
  const scaleBarPx = scaleM * proj.scale;
  const scaleLabel = `${String(scaleM).replace(".", ",")} m`;

  const allRect = shapes.every(isRectilinear);
  const uni = allRect ? unionRectilinear(shapes) : { outer: [], holes: [], regions: shapes.length, area: 0 };
  const regions = uni.regions;
  const invalid = regions > 1;
  const strokeColor = invalid ? RED : HS_PURPLE;
  const canFlatten = regions === 1 && uni.holes.length === 0;

  const ringD = (r) => "M " + r.map((p) => { const q = g2s(p); return `${q.x.toFixed(2)} ${q.y.toFixed(2)}`; }).join(" L ") + " Z";
  const unionD = [...uni.outer, ...uni.holes].map(ringD).join(" ");

  const gb = bboxOf(allPts);
  const gridLines = [];
  for (let x = Math.ceil(gb.minX / GRID_M) * GRID_M; x <= gb.maxX + 1e-6; x += GRID_M) {
    const a = g2s({ x, y: gb.minY });
    const b = g2s({ x, y: gb.maxY });
    gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  for (let y = Math.ceil(gb.minY / GRID_M) * GRID_M; y <= gb.maxY + 1e-6; y += GRID_M) {
    const a = g2s({ x: gb.minX, y });
    const b = g2s({ x: gb.maxX, y });
    gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  function clientToViewbox(e) {
    const svg = svgRef.current;
    if (!svg || !svg.getScreenCTM) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  function clientToGround(e) {
    const vb = clientToViewbox(e);
    return vb ? screenToGround(proj, vb.x, vb.y) : null;
  }

  function startVertexDrag(index, e) {
    setFrozenProj(buildProjection(fitPts, zoom, pan));
    setSelected(index);
    setEditEdge(null);
    setDrag({ kind: "vertex", index });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function startShapeDrag(index, e) {
    const fp = buildProjection(fitPts, zoom, pan);
    const vb = clientToViewbox(e);
    const g = vb ? screenToGround(fp, vb.x, vb.y) : null;
    setActive(index);
    setSelected(null);
    setEditEdge(null);
    setFrozenProj(fp);
    setDrag({ kind: "shape", index, startG: g, orig: shapes[index] });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function openEdgeEditor(index) {
    const s = shapes[0];
    const len = edgeLength(s[index], s[(index + 1) % s.length]);
    setSelected(null);
    setEditEdge({ index, value: fmt(len) });
  }

  function onPointerDown(e) {
    const t = e.target;
    const handle = t.closest && t.closest("[data-handle]");
    if (handle) { startVertexDrag(Number(handle.getAttribute("data-handle")), e); return; }
    const edge = t.closest && t.closest("[data-edge]");
    if (edge) { openEdgeEditor(Number(edge.getAttribute("data-edge"))); return; }
    const shp = t.closest && t.closest("[data-shape]");
    if (shp) { startShapeDrag(Number(shp.getAttribute("data-shape")), e); return; }
    const vb = clientToViewbox(e);
    if (vb) panStart.current = { x: vb.x, y: vb.y, pan: { ...pan } };
    setSelected(null);
    setEditEdge(null);
    setDrag({ kind: "pan" });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function onPointerMove(e) {
    if (!drag) return;
    if (drag.kind === "vertex") {
      const g = clientToGround(e);
      if (!g) return;
      const sx = snap(g.x, SNAP_M);
      const sy = snap(g.y, SNAP_M);
      setShapes((prev) => prev.map((s, i) => (i === active ? orthDragVertex(s, drag.index, sx, sy) : s)));
    } else if (drag.kind === "shape") {
      const vb = clientToViewbox(e);
      if (!vb || !drag.startG) return;
      const g = screenToGround(frozenProj, vb.x, vb.y);
      const dx = snap(g.x - drag.startG.x, SNAP_M);
      const dy = snap(g.y - drag.startG.y, SNAP_M);
      setShapes((prev) => prev.map((s, i) => (i === drag.index ? translatePolygon(drag.orig, dx, dy) : s)));
    } else if (drag.kind === "pan" && panStart.current) {
      const vb = clientToViewbox(e);
      if (!vb) return;
      setPan({
        x: panStart.current.pan.x + (vb.x - panStart.current.x),
        y: panStart.current.pan.y + (vb.y - panStart.current.y),
      });
    }
  }
  function onPointerUp(e) {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (drag && (drag.kind === "vertex" || drag.kind === "shape")) commit(shapes);
    setDrag(null);
  }
  function onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
    if (editEdge) { if (e.key === "Escape") setEditEdge(null); return; }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotateActive(!e.shiftKey); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && shapes.length > 1) {
      e.preventDefault();
      removeShape();
    }
  }

  function resetView() { setFitPts(shapes.flat()); setZoom(1); setPan({ x: 0, y: 0 }); }
  function addShape(pts) {
    const b = bboxOf(shapes.flat());
    const nb = bboxOf(pts);
    const placed = translatePolygon(pts, (b.maxX + 1) - nb.minX, b.minY - nb.minY);
    const next = [...shapes, placed];
    commit(next);
    setActive(next.length - 1);
    setSelected(null);
    setEditEdge(null);
    setFitPts(next.flat());
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  function removeShape() {
    if (shapes.length <= 1) return;
    const next = shapes.filter((_, i) => i !== active);
    commit(next);
    setActive((a) => Math.min(a, next.length - 1));
    setSelected(null);
  }
  function rotateActive(cw) {
    const poly = shapes[active];
    if (!poly) return;
    const b = bboxOf(poly);
    const center = { x: snap((b.minX + b.maxX) / 2, SNAP_M), y: snap((b.minY + b.maxY) / 2, SNAP_M) };
    const rot = rotatePolygon90(poly, cw, center).map((p) => ({ ...p, x: snap(p.x, SNAP_M), y: snap(p.y, SNAP_M) }));
    commit(shapes.map((s, i) => (i === active ? rot : s)));
    setSelected(null);
  }
  function fuseShapes() {
    const f = flattenUnion(shapes);
    if (!f) return;
    commit([f.outline]);
    setActive(0);
    setSelected(null);
    setEditEdge(null);
    setFitPts(f.outline);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  function applyEdgeEdit() {
    if (!editEdge) return;
    const v = parseFloat(String(editEdge.value).replace(",", "."));
    if (Number.isFinite(v) && v > 0) {
      commit(shapes.map((s, i) => (i === 0 ? resizeEdge(s, editEdge.index, snap(v, SNAP_M)) : s)));
    }
    setEditEdge(null);
  }

  const activeShape = shapes[active] || shapes[0];

  // Cotes d'un anneau (ground). editable -> arête cliquable (une seule forme).
  function cotes(ring, editable, kp) {
    return ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const len = edgeLength(a, b);
      if (len < 1e-6) return null;
      const sa = g2s(a);
      const sb = g2s(b);
      const mid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
      return (
        <g key={`${kp}-${i}`}>
          {editable && (
            <line
              data-edge={i}
              x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y}
              stroke="transparent" strokeWidth={14}
              style={{ pointerEvents: "stroke", cursor: "text" }}
            />
          )}
          <text
            x={mid.x} y={mid.y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={12} fontWeight={700}
            fill={editable ? HS_PURPLE : "#6b7280"}
            stroke="#ffffff" strokeWidth={3} paintOrder="stroke"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {fmt(len)} m
          </text>
        </g>
      );
    });
  }

  let editBox = null;
  if (single && editEdge) {
    const s = shapes[0];
    const a = s[editEdge.index];
    const b = s[(editEdge.index + 1) % s.length];
    const m = g2s({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    editBox = (
      <foreignObject x={m.x - 46} y={m.y - 16} width={92} height={32} style={{ overflow: "visible" }}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: "flex", justifyContent: "center" }}>
          <input
            autoFocus
            value={editEdge.value}
            onChange={(e) => setEditEdge((st) => ({ ...st, value: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyEdgeEdit(); } else if (e.key === "Escape") { setEditEdge(null); } }}
            onBlur={applyEdgeEdit}
            style={{ width: 72, fontSize: 12, fontWeight: 700, textAlign: "center", color: HS_PURPLE, border: `1.5px solid ${HS_PURPLE}`, borderRadius: 6, padding: "3px 4px", outline: "none" }}
          />
        </div>
      </foreignObject>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <header>
        <div style={{ fontSize: 12, color: "#6b7280" }}>ACV — nouveau constructeur</div>
        <h1 style={{ fontSize: 28, margin: "4px 0", color: "#111827", display: "flex", alignItems: "center", gap: 10 }}>
          Constructeur visuel
          <span style={{ fontSize: 11, fontWeight: 800, color: HS_PURPLE, background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 10px" }}>POC</span>
          {single && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 999, padding: "2px 10px" }}>Emprise · murs éditables</span>
          )}
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
          {single
            ? "Clique un mur pour saisir sa longueur. Ajoute une forme pour agrandir, pivote par 1/4 de tour. Ctrl+Z / Ctrl+Y."
            : "Glisse les formes pour qu'elles se touchent, puis « Fusionner l'emprise ». Glisse un coin pour redimensionner."}
        </p>
      </header>

      {/* Contrôles */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, padding: "10px 14px", background: "#f9fafb", border: "1px solid #eef2f7", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={undo} disabled={!canUndo} style={{ ...iconBtn, opacity: canUndo ? 1 : 0.4, cursor: canUndo ? "pointer" : "default" }} title="Annuler (Ctrl+Z)"><Undo2 size={16} /></button>
          <button type="button" onClick={redo} disabled={!canRedo} style={{ ...iconBtn, opacity: canRedo ? 1 : 0.4, cursor: canRedo ? "pointer" : "default" }} title="Rétablir (Ctrl+Y)"><Redo2 size={16} /></button>
        </div>
        <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))} style={iconBtn} title="Zoom arrière"><Minus size={16} /></button>
          <span style={{ width: 46, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))} style={iconBtn} title="Zoom avant"><Plus size={16} /></button>
          <button type="button" onClick={resetView} style={{ ...iconBtn, width: "auto", padding: "6px 10px", gap: 6, fontSize: 12, fontWeight: 600, color: "#6b7280" }} title="Recentrer la vue"><Maximize size={14} /> Recentrer</button>
        </div>
        <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => rotateActive(false)} style={iconBtn} title="Pivoter -90° (Maj+R)"><RotateCcw size={16} /></button>
          <button type="button" onClick={() => rotateActive(true)} style={iconBtn} title="Pivoter +90° (R)"><RotateCw size={16} /></button>
        </div>
        <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />
        <button type="button" onClick={removeShape} disabled={shapes.length <= 1} style={{ ...iconBtn, width: "auto", padding: "6px 10px", gap: 6, fontSize: 12, fontWeight: 600, color: shapes.length <= 1 ? "#d1d5db" : "#b91c1c", cursor: shapes.length <= 1 ? "default" : "pointer" }} title="Supprimer la forme active (Suppr)"><Trash2 size={14} /> Supprimer</button>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{shapes.length} forme{shapes.length > 1 ? "s" : ""}</div>
        {!invalid && !canFlatten && uni.holes.length > 0 && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 999, padding: "3px 10px" }}>
            Cour intérieure : fusion indisponible pour l'instant
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: HS_PURPLE, fontVariantNumeric: "tabular-nums" }}>{fmt(uni.area)} m²</div>
          {!single && (
            <button type="button" onClick={fuseShapes} disabled={!canFlatten} style={{ ...primaryBtn, opacity: canFlatten ? 1 : 0.4, cursor: canFlatten ? "pointer" : "default" }} title={canFlatten ? "Réduire l'assemblage en une forme éditable" : "Les formes doivent former un seul îlot sans cour"}><Check size={15} /> Fusionner l'emprise</button>
          )}
        </div>
      </div>

      {/* Ajouter une forme */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginRight: 4 }}>Ajouter une forme</span>
        {TEMPLATES.map((tp) => (
          <button key={tp.key} type="button" onClick={() => addShape(tp.pts)} title={`Ajouter ${tp.label}`} style={chipStyle} className="hs-clickable">
            <svg width={40} height={26} viewBox="0 0 40 26" style={{ display: "block" }}>
              <polygon points={thumb(tp.pts, 40, 26)} fill="rgba(89,22,156,0.12)" stroke={HS_PURPLE} strokeWidth={1.4} strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>{tp.label}</span>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <main style={{ flex: 1, position: "relative", borderRadius: 16, overflow: "hidden", background: "#ffffff", border: "1px solid #eef2f7" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          tabIndex={0}
          style={{ display: "block", touchAction: "none", outline: "none", cursor: drag && drag.kind === "pan" ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <defs>
            <clipPath id="acvFootprintClip"><path d={unionD} clipRule="evenodd" /></clipPath>
          </defs>
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="transparent" style={{ pointerEvents: "all" }} />

          <path d={unionD} fillRule="evenodd" fill="rgba(89,22,156,0.10)" style={{ pointerEvents: "none" }} />

          <g clipPath="url(#acvFootprintClip)">
            {gridLines.map((l, i) => (
              <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="rgba(89,22,156,0.35)" strokeWidth="1" />
            ))}
          </g>

          {!single && activeShape && (
            <polygon points={activeShape.map(g2s).map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(89,22,156,0.10)" stroke="none" style={{ pointerEvents: "none" }} />
          )}

          {shapes.map((s, i) => (
            <polygon key={`hit-${i}`} data-shape={i} points={s.map(g2s).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" style={{ pointerEvents: "all", cursor: "move" }} />
          ))}

          <path d={unionD} fillRule="evenodd" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round" style={{ pointerEvents: "none" }} />

          {/* Cotes : éditables si une seule forme, sinon contour total en lecture */}
          {single
            ? cotes(shapes[0], true, "edit")
            : uni.outer.map((ring, ri) => <g key={`ro-${ri}`}>{cotes(ring, false, `ro${ri}`)}</g>)}

          {editBox}

          {activeShape && activeShape.map(g2s).map((p, i) => (
            <circle key={`v-${i}`} data-handle={i} cx={p.x} cy={p.y} r={i === selected ? 9 : 8} fill={i === selected ? HS_PURPLE : "#ffffff"} stroke={HS_PURPLE} strokeWidth={2.5} style={{ cursor: "grab" }}>
              <title>Coin {i + 1}</title>
            </circle>
          ))}

          {/* Barre d'échelle (bas gauche) */}
          {scaleBarPx > 4 && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={14} y1={VIEW_H - 20} x2={14 + scaleBarPx} y2={VIEW_H - 20} stroke="#111827" strokeWidth={3} />
              <line x1={14} y1={VIEW_H - 26} x2={14} y2={VIEW_H - 14} stroke="#111827" strokeWidth={3} />
              <line x1={14 + scaleBarPx} y1={VIEW_H - 26} x2={14 + scaleBarPx} y2={VIEW_H - 14} stroke="#111827" strokeWidth={3} />
              <text x={14 + scaleBarPx / 2} y={VIEW_H - 30} textAnchor="middle" fontSize={13} fontWeight={800} fill="#111827" stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke">{scaleLabel}</text>
            </g>
          )}
        </svg>
        {invalid && (
          <div style={{ position: "absolute", left: 14, top: 12, fontSize: 11, fontWeight: 600, color: "#b91c1c", background: "rgba(254,242,242,0.9)", border: "1px solid #fecaca", borderRadius: 8, padding: "3px 8px", pointerEvents: "none" }}>
            ⚠ {regions} îlots — les formes doivent se toucher
          </div>
        )}
      </main>
    </div>
  );
}

const iconBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 8, border: "1px solid #e5e7eb",
  background: "#ffffff", color: "#374151", cursor: "pointer",
};
const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px",
  borderRadius: 8, border: "none", background: HS_PURPLE, color: "#ffffff",
  fontSize: 13, fontWeight: 700,
};
const chipStyle = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb",
  background: "#ffffff", cursor: "pointer",
};
