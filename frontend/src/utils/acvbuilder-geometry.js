// Géométrie du constructeur ACV (module ACV 3D).
// Maths pures et testées : projection oblique du plan sol <-> écran, aire, snap.
// Isolé de la vue pour éviter les erreurs de surface silencieuses.

/** @typedef {{ x: number, y: number }} Pt */
/**
 * @typedef {Object} Projection
 * @property {number} scale   px par mètre
 * @property {number} tilt    inclinaison en radians (0 = vue du dessus)
 * @property {number} oblique intensité du biais horizontal quand incliné
 * @property {number} originX décalage écran X (px)
 * @property {number} originY décalage écran Y (px)
 * @property {Pt} ex          image écran de l'axe largeur (1 m)
 * @property {Pt} ey          image écran de l'axe profondeur (1 m)
 */

/**
 * Construit une projection oblique du plan sol (mètres) vers l'écran (px).
 * tilt = 0 -> vue du dessus (profondeur = axe vertical) ;
 * tilt croissant -> plan incliné (profondeur raccourcie + biais horizontal).
 * @param {{ scale: number, tilt: number, originX?: number, originY?: number, oblique?: number }} o
 * @returns {Projection}
 */
export function makeProjection({ scale, tilt, originX = 0, originY = 0, oblique = 0.9 }) {
  const ex = { x: scale, y: 0 };
  const ey = { x: scale * oblique * Math.sin(tilt), y: -scale * Math.cos(tilt) };
  return { scale, tilt, oblique, originX, originY, ex, ey };
}

/**
 * Sol (m) -> écran (px).
 * @param {Projection} p @param {number} gx @param {number} gy @returns {Pt}
 */
export function groundToScreen(p, gx, gy) {
  return {
    x: p.originX + gx * p.ex.x + gy * p.ey.x,
    y: p.originY + gx * p.ex.y + gy * p.ey.y,
  };
}

/**
 * Écran (px) -> sol (m). Inverse exact de groundToScreen (tant que tilt < 90°).
 * @param {Projection} p @param {number} sx @param {number} sy @returns {Pt}
 */
export function screenToGround(p, sx, sy) {
  // Matrice [[ex.x, ey.x], [ex.y, ey.y]] avec ex.y = 0 -> inversion directe.
  const dx = sx - p.originX;
  const dy = sy - p.originY;
  const gy = dy / p.ey.y;
  const gx = (dx - gy * p.ey.x) / p.ex.x;
  return { x: gx, y: gy };
}

/**
 * Aire (m²) d'un polygone sol (formule du lacet). Généralise au rectangle et aux formes en L.
 * @param {Pt[]} pts @returns {number}
 */
export function polygonAreaM2(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Arrondit une valeur au pas donné (snap grille).
 * @param {number} v @param {number} step @returns {number}
 */
export function snap(v, step) {
  return Math.round(v / step) * step;
}

/**
 * Milieu de chaque arête du polygone (points d'insertion « + »).
 * @param {Pt[]} pts @returns {Pt[]}
 */
export function edgeMidpoints(pts) {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  });
}

/**
 * Insère un sommet juste après l'index donné (nouveau tableau).
 * @param {Pt[]} pts @param {number} index @param {Pt} pt @returns {Pt[]}
 */
export function insertVertexAfter(pts, index, pt) {
  const out = pts.slice();
  out.splice(index + 1, 0, { x: pt.x, y: pt.y });
  return out;
}

/**
 * Retire un sommet — garde au moins 3 sommets (sinon renvoie l'entrée inchangée).
 * @param {Pt[]} pts @param {number} index @returns {Pt[]}
 */
export function removeVertex(pts, index) {
  if (pts.length <= 3) return pts;
  const out = pts.slice();
  out.splice(index, 1);
  return out;
}

function _orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

// Croisement STRICT de deux segments [a,b] et [c,d] (ignore les contacts par extrémité).
function _segmentsCross(a, b, c, d) {
  const d1 = _orient(c, d, a);
  const d2 = _orient(c, d, b);
  const d3 = _orient(a, b, c);
  const d4 = _orient(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Le polygone se croise-t-il lui-même ? (arêtes non adjacentes qui se coupent)
 * @param {Pt[]} pts @returns {boolean}
 */
export function polygonSelfIntersects(pts) {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1) continue;                 // arêtes consécutives (sommet commun)
      if (i === 0 && j === n - 1) continue;       // première et dernière (sommet commun)
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (_segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Distance d'un point au segment [a,b] (pour la détection de survol d'arête).
 * @param {Pt} p @param {Pt} a @param {Pt} b @returns {number}
 */
export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Points le long d'un arc circulaire de a vers b (exclut a, inclut b).
 * sweepDeg = angle de l'arc ; ccw choisit le côté du bombement.
 * @param {Pt} a @param {Pt} b @param {number} sweepDeg @param {boolean} ccw @param {number} segs
 * @returns {Pt[]}
 */
export function arcPoints(a, b, sweepDeg, ccw, segs) {
  const theta = (sweepDeg * Math.PI) / 180;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9 || segs < 1) return [{ x: b.x, y: b.y }];
  const r = (chord / 2) / Math.sin(theta / 2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
  const ux = -dy / chord;
  const uy = dx / chord;
  const s = ccw ? 1 : -1;
  const cx = mx + s * d * ux;
  const cy = my + s * d * uy;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const a1 = Math.atan2(b.y - cy, b.x - cx);
  let sweep = a1 - a0;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (s > 0 && sweep < 0) sweep += 2 * Math.PI;
  if (s < 0 && sweep > 0) sweep -= 2 * Math.PI;
  const out = [];
  for (let k = 1; k <= segs; k++) {
    const ang = a0 + sweep * (k / segs);
    out.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  }
  return out;
}

/**
 * Développe un contour en polygone plat. Un sommet portant
 * `arc = {sweepDeg, ccw}` rend l'arête vers le suivant courbe.
 * @param {Array<{x:number,y:number,arc?:{sweepDeg:number,ccw:boolean}}>} points
 * @param {number} [segs]
 * @returns {Pt[]}
 */
export function facetShape(points, segs = 48) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    out.push({ x: p.x, y: p.y });
    if (p.arc) {
      const nxt = points[(i + 1) % n];
      const arc = arcPoints(p, nxt, p.arc.sweepDeg, p.arc.ccw, segs);
      for (let k = 0; k < arc.length - 1; k++) out.push(arc[k]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Multi-formes : union de polygones RECTILIGNES (arêtes horizontales/verticales).
// Balayage par bandes horizontales -> rectangles -> contour par annulation d'arêtes.
// Robuste (coords snappées sur grille, aucune intersection oblique à calculer).
// Les formes à arcs sont exclues (voir isRectilinear) -> traitées séparément.
// ---------------------------------------------------------------------------

const _EPS = 1e-9;
const _q = (v) => Math.round(v * 1e6) / 1e6;
const _k = (p) => `${_q(p.x)},${_q(p.y)}`;
const _ek = (a, b) => `${_k(a)}|${_k(b)}`;

/**
 * Toutes les arêtes sont-elles horizontales ou verticales ? (forme orthogonale)
 * Un polygone à arc (< 4 sommets ou arête oblique) renvoie false.
 * @param {Pt[]} pts @returns {boolean}
 */
export function isRectilinear(pts) {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.abs(a.x - b.x) > _EPS && Math.abs(a.y - b.y) > _EPS) return false;
  }
  return true;
}

/**
 * Translate un polygone (nouveau tableau, sans mutation). Conserve `arc`.
 * @param {Array<{x:number,y:number}>} pts @param {number} dx @param {number} dy
 */
export function translatePolygon(pts, dx, dy) {
  return pts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

/**
 * Union de polygones rectilignes.
 * @param {Pt[][]} shapes  tableau de polygones (chacun rectiligne)
 * @returns {{ outer: Pt[][], holes: Pt[][], regions: number, area: number }}
 *   outer   = contours extérieurs (CCW), holes = trous (CW),
 *   regions = nb de régions connexes (1 attendu pour passer en 3D),
 *   area    = aire exacte de l'union (m²).
 */
export function unionRectilinear(shapes) {
  const ys = [...new Set(shapes.flat().map((p) => _q(p.y)))].sort((a, b) => a - b);

  // 1. Bandes horizontales -> rectangles couvrant l'union (union 1D par bande).
  const rects = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    const intervals = [];
    for (const s of shapes) {
      const xs = [];
      const n = s.length;
      for (let kk = 0; kk < n; kk++) {
        const a = s[kk];
        const b = s[(kk + 1) % n];
        if (Math.abs(a.x - b.x) < _EPS) {                 // arête verticale
          const lo = Math.min(a.y, b.y);
          const hi = Math.max(a.y, b.y);
          if (lo <= y0 + _EPS && hi >= y1 - _EPS) xs.push(a.x); // traverse la bande
        }
      }
      xs.sort((p, r) => p - r);
      for (let kk = 0; kk + 1 < xs.length; kk += 2) intervals.push([xs[kk], xs[kk + 1]]); // pair/impair
    }
    intervals.sort((p, r) => p[0] - r[0]);
    const merged = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (!last || iv[0] > last[1] + _EPS) merged.push([iv[0], iv[1]]);
      else last[1] = Math.max(last[1], iv[1]);
    }
    for (const [x0, x1] of merged) rects.push({ x0, x1, y0, y1 });
  }

  const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);

  // 2. Contour : chaque rect en CCW, arêtes horizontales découpées sur la grille X
  //    -> les arêtes partagées s'annulent, il reste la frontière.
  const xsAll = [...new Set(rects.flatMap((r) => [_q(r.x0), _q(r.x1)]))].sort((a, b) => a - b);
  const cut = (xa, xb) => xsAll.filter((x) => x >= Math.min(xa, xb) - _EPS && x <= Math.max(xa, xb) + _EPS);

  const counts = new Map();
  const pts = new Map();
  const addEdge = (a, b) => {
    pts.set(_k(a), { x: _q(a.x), y: _q(a.y) });
    pts.set(_k(b), { x: _q(b.x), y: _q(b.y) });
    const rk = _ek(b, a);
    if (counts.get(rk)) { const c = counts.get(rk) - 1; if (c) counts.set(rk, c); else counts.delete(rk); }
    else counts.set(_ek(a, b), (counts.get(_ek(a, b)) || 0) + 1);
  };
  for (const r of rects) {
    const gx = cut(r.x0, r.x1);
    for (let kk = 0; kk + 1 < gx.length; kk++) addEdge({ x: gx[kk], y: r.y0 }, { x: gx[kk + 1], y: r.y0 }); // bas ->
    addEdge({ x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 });                                                    // droite ^
    for (let kk = gx.length - 1; kk - 1 >= 0; kk--) addEdge({ x: gx[kk], y: r.y1 }, { x: gx[kk - 1], y: r.y1 }); // haut <-
    addEdge({ x: r.x0, y: r.y1 }, { x: r.x0, y: r.y0 });                                                    // gauche v
  }

  // 3. Chaînage des arêtes restantes en boucles fermées.
  const adj = new Map();
  for (const [ek, c] of counts) {
    if (c <= 0) continue;
    const bar = ek.indexOf("|");
    const ak = ek.slice(0, bar);
    const bk = ek.slice(bar + 1);
    if (!adj.has(ak)) adj.set(ak, []);
    for (let t = 0; t < c; t++) adj.get(ak).push(bk);
  }
  const loops = [];
  for (const start of [...adj.keys()]) {
    while ((adj.get(start) || []).length) {
      const loop = [start];
      let cur = start;
      for (;;) {
        const nbrs = adj.get(cur);
        if (!nbrs || !nbrs.length) break;
        const nxt = nbrs.shift();
        if (nxt === start) break;
        loop.push(nxt);
        cur = nxt;
      }
      loops.push(loop.map((k) => pts.get(k)));
    }
  }

  // 4. Simplifie (retire les points colinéaires) + sépare extérieurs / trous.
  const simplify = (loop) => {
    const out = [];
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[(i - 1 + n) % n];
      const b = loop[i];
      const c = loop[(i + 1) % n];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(cross) > _EPS) out.push(b);
    }
    return out;
  };
  const signedArea = (r) => {
    let s = 0;
    for (let i = 0; i < r.length; i++) { const a = r[i]; const b = r[(i + 1) % r.length]; s += a.x * b.y - b.x * a.y; }
    return s / 2;
  };
  const rings = loops.map(simplify).filter((r) => r.length >= 3);
  const outer = rings.filter((r) => signedArea(r) > 0);
  const holes = rings.filter((r) => signedArea(r) < 0);
  return { outer, holes, regions: outer.length, area };
}

/**
 * Longueur d'une arête [a,b] (mètres) — pour les cotes.
 * @param {Pt} a @param {Pt} b @returns {number}
 */
export function edgeLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Rotation de ±90° d'un polygone autour d'un centre (rectilinéarité préservée).
 * @param {Array<{x:number,y:number}>} pts
 * @param {boolean} cw  true = horaire, false = anti-horaire
 * @param {{x:number,y:number}} [center]  centre (déf. = centre de la bbox)
 * @returns {Array<{x:number,y:number}>}
 */
export function rotatePolygon90(pts, cw, center) {
  let cx;
  let cy;
  if (center) { cx = center.x; cy = center.y; }
  else {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  return pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return cw ? { ...p, x: cx + dy, y: cy - dx } : { ...p, x: cx - dy, y: cy + dx };
  });
}

/**
 * Redimensionne l'arête `ei` (V_ei -> V_ei+1) à `newLen` en gardant V_ei fixe.
 * L'extrémité mobile glisse le long de l'axe de l'arête ; le voisin
 * perpendiculaire suit -> la forme reste rectiligne.
 * @param {Array<{x:number,y:number}>} pts @param {number} ei @param {number} newLen
 * @returns {Array<{x:number,y:number}>}
 */
export function resizeEdge(pts, ei, newLen) {
  const n = pts.length;
  const out = pts.map((p) => ({ ...p }));
  if (!Number.isFinite(newLen) || newLen <= 0) return out;
  const a = out[ei];
  const b = out[(ei + 1) % n];
  const c = out[(ei + 2) % n];
  const horizontal = Math.abs(b.y - a.y) < _EPS;
  if (horizontal) {
    const sign = b.x - a.x >= 0 ? 1 : -1;
    const oldBx = b.x;
    b.x = a.x + sign * newLen;
    if (Math.abs(c.x - oldBx) < _EPS) c.x = b.x; // voisin (arête verticale) suit
  } else {
    const sign = b.y - a.y >= 0 ? 1 : -1;
    const oldBy = b.y;
    b.y = a.y + sign * newLen;
    if (Math.abs(c.y - oldBy) < _EPS) c.y = b.y; // voisin (arête horizontale) suit
  }
  return out;
}

/**
 * Aplatit un assemblage fusionné en UN polygone éditable (contour extérieur + trous).
 * @param {Pt[][]} shapes
 * @returns {{ outline: Pt[], holes: Pt[][] } | null}  null si non connexe (regions !== 1)
 */
export function flattenUnion(shapes) {
  const u = unionRectilinear(shapes);
  if (u.regions !== 1) return null;
  return { outline: u.outer[0], holes: u.holes };
}
