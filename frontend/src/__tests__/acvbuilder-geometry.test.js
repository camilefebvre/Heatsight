import { describe, it, expect } from "vitest";
import {
  makeProjection,
  groundToScreen,
  screenToGround,
  polygonAreaM2,
  snap,
  edgeMidpoints,
  insertVertexAfter,
  removeVertex,
  polygonSelfIntersects,
  pointSegmentDistance,
  facetShape,
  isRectilinear,
  translatePolygon,
  unionRectilinear,
  edgeLength,
  rotatePolygon90,
  resizeEdge,
  flattenUnion,
} from "../utils/acvbuilder-geometry.js";

const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe("acvbuilder-geometry", () => {
  it("aller-retour sol<->écran exact pour plusieurs inclinaisons", () => {
    for (const tiltDeg of [0, 10, 22, 35]) {
      const tilt = (tiltDeg * Math.PI) / 180;
      const p = makeProjection({ scale: 24, tilt, originX: 120, originY: 300, oblique: 0.9 });
      for (const [gx, gy] of [[0, 0], [10, 0], [10, 7], [0, 7], [3.5, 4.2]]) {
        const s = groundToScreen(p, gx, gy);
        const back = screenToGround(p, s.x, s.y);
        expect(back.x).toBeCloseTo(gx, 6);
        expect(back.y).toBeCloseTo(gy, 6);
      }
    }
  });

  it("vue du dessus (tilt 0) : largeur -> +x, profondeur -> -y", () => {
    const p = makeProjection({ scale: 10, tilt: 0, originX: 0, originY: 0 });
    expect(groundToScreen(p, 5, 0)).toEqual({ x: 50, y: 0 });
    expect(groundToScreen(p, 0, 5)).toEqual({ x: 0, y: -50 });
  });

  it("aire d'un rectangle = largeur × profondeur", () => {
    const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }];
    expect(polygonAreaM2(rect)).toBeCloseTo(70, 9);
  });

  it("aire d'une forme en L (10×10 avec encoche 6×4)", () => {
    // Colonne x∈[0,4] pleine (4×10=40) + bande x∈[4,10] y∈[0,6] (6×6=36) = 76
    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
      { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ];
    expect(polygonAreaM2(L)).toBeCloseTo(76, 9);
  });

  it("snap arrondit au pas", () => {
    expect(snap(3.24, 0.5)).toBe(3);
    expect(snap(3.26, 0.5)).toBe(3.5);
    expect(snap(-0.2, 0.5)).toBe(-0);
  });

  it("edgeMidpoints : un milieu par arête", () => {
    const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
    const m = edgeMidpoints(rect);
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual({ x: 5, y: 0 });
    expect(m[3]).toEqual({ x: 0, y: 3 });
  });

  it("insertVertexAfter insère au bon endroit sans muter l'entrée", () => {
    const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
    const out = insertVertexAfter(rect, 0, { x: 5, y: 0 });
    expect(out).toHaveLength(5);
    expect(out[1]).toEqual({ x: 5, y: 0 });
    expect(rect).toHaveLength(4); // pas de mutation
  });

  it("removeVertex retire mais garde >= 3 sommets", () => {
    const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
    expect(removeVertex(rect, 1)).toHaveLength(3);
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 6 }];
    expect(removeVertex(tri, 0)).toHaveLength(3); // refuse de descendre sous 3
  });

  it("forme en L construite par insertion : aire cohérente", () => {
    // Rectangle 10×10, on tire un coin pour créer une encoche -> L de 76 m²
    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
      { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ];
    expect(polygonAreaM2(L)).toBeCloseTo(76, 9);
  });

  it("polygonSelfIntersects : rectangle et L sont valides", () => {
    expect(polygonSelfIntersects([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }])).toBe(false);
    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
      { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ];
    expect(polygonSelfIntersects(L)).toBe(false);
  });

  it("polygonSelfIntersects : nœud papillon détecté", () => {
    // Quadrilatère croisé : les diagonales se coupent
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(polygonSelfIntersects(bowtie)).toBe(true);
  });

  it("pointSegmentDistance : distance perpendiculaire et projection bornée", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(pointSegmentDistance({ x: 5, y: 5 }, a, b)).toBeCloseTo(5, 9);
    expect(pointSegmentDistance({ x: 5, y: 0 }, a, b)).toBeCloseTo(0, 9);
    expect(pointSegmentDistance({ x: -3, y: 0 }, a, b)).toBeCloseTo(3, 9); // au-delà de a
  });

  it("facetShape : polygone sans arc = inchangé", () => {
    const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }];
    expect(facetShape(rect)).toEqual(rect.map((p) => ({ x: p.x, y: p.y })));
  });

  it("facetShape : demi-cercle ≈ aire d'un demi-disque (r=6)", () => {
    const demi = [{ x: 0, y: 0 }, { x: 12, y: 0, arc: { sweepDeg: 180, ccw: true } }];
    expect(polygonAreaM2(facetShape(demi, 128))).toBeCloseTo((Math.PI * 36) / 2, 0);
  });

  it("facetShape : quart de cercle ≈ aire d'un quart de disque (r=8)", () => {
    const q = [{ x: 0, y: 0 }, { x: 8, y: 0, arc: { sweepDeg: 90, ccw: true } }, { x: 0, y: 8 }];
    expect(polygonAreaM2(facetShape(q, 128))).toBeCloseTo((Math.PI * 64) / 4, 0);
  });

  it("isRectilinear : rectangle et L vrais, triangle/arc/oblique faux", () => {
    expect(isRectilinear(rect(0, 0, 10, 7))).toBe(true);
    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 },
      { x: 4, y: 6 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ];
    expect(isRectilinear(L)).toBe(true);
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 6, y: 9 }])).toBe(false); // triangle
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 12, y: 0, arc: { sweepDeg: 180, ccw: true } }])).toBe(false); // demi-cercle
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 10, y: 7 }, { x: 0, y: 7 }])).toBe(false); // arête oblique
  });

  it("translatePolygon décale sans muter l'entrée", () => {
    const r = rect(0, 0, 4, 3);
    const t = translatePolygon(r, 5, 2);
    expect(t[0]).toEqual({ x: 5, y: 2 });
    expect(t[2]).toEqual({ x: 9, y: 5 });
    expect(r[0]).toEqual({ x: 0, y: 0 }); // pas de mutation
  });

  it("unionRectilinear : deux rectangles disjoints -> 2 régions, aire = somme", () => {
    const u = unionRectilinear([rect(0, 0, 4, 4), rect(10, 0, 4, 4)]);
    expect(u.regions).toBe(2);
    expect(u.area).toBeCloseTo(32, 9);
    expect(u.holes).toHaveLength(0);
  });

  it("unionRectilinear : deux rectangles qui se chevauchent -> 1 région, recouvrement non compté", () => {
    // 10×10 + 10×10 décalé de (6,6) : union = 200 - 16 (chevauchement 4×4) = 184
    const u = unionRectilinear([rect(0, 0, 10, 10), rect(6, 6, 10, 10)]);
    expect(u.regions).toBe(1);
    expect(u.area).toBeCloseTo(184, 9);
  });

  it("unionRectilinear : deux rectangles accolés -> 1 région rectangulaire, aire = somme", () => {
    const u = unionRectilinear([rect(0, 0, 5, 4), rect(5, 0, 5, 4)]);
    expect(u.regions).toBe(1);
    expect(u.area).toBeCloseTo(40, 9);
    expect(u.outer[0]).toHaveLength(4); // redevient un simple rectangle 10×4
  });

  it("unionRectilinear : rectangle dans un autre -> 1 région, aire = grand", () => {
    const u = unionRectilinear([rect(0, 0, 10, 10), rect(3, 3, 2, 2)]);
    expect(u.regions).toBe(1);
    expect(u.area).toBeCloseTo(100, 9);
  });

  it("unionRectilinear : jonction en T -> 1 région, aire correcte", () => {
    // façade 12×2 (24) + aile 2×6 posée dessus, x∈[5,7] y∈[2,8] (12) = 36
    const u = unionRectilinear([rect(0, 0, 12, 2), rect(5, 2, 2, 6)]);
    expect(u.regions).toBe(1);
    expect(u.area).toBeCloseTo(36, 9);
  });

  it("unionRectilinear : U + barre -> cour fermée (1 trou)", () => {
    // U : deux jambes + une base, refermé par une barre en haut -> trou central
    const legL = rect(0, 0, 3, 10);
    const legR = rect(9, 0, 3, 10);
    const base = rect(0, 0, 12, 3);
    const top = rect(0, 8, 12, 2);
    const u = unionRectilinear([legL, legR, base, top]);
    expect(u.regions).toBe(1);
    expect(u.holes).toHaveLength(1);
    // trou = rectangle x∈[3,9] y∈[3,8] = 6×5 = 30 ; anneau = 12×10 - 30 = 90
    expect(u.area).toBeCloseTo(90, 9);
  });

  it("edgeLength : longueur euclidienne d'une arête", () => {
    expect(edgeLength({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(10, 9);
    expect(edgeLength({ x: 2, y: 3 }, { x: 2, y: 8 })).toBeCloseTo(5, 9);
  });

  it("rotatePolygon90 : reste rectiligne, aire conservée, horaire = (y, -x)", () => {
    const r = rect(0, 0, 4, 2);
    const cw = rotatePolygon90(r, true, { x: 0, y: 0 });
    expect(isRectilinear(cw)).toBe(true);
    expect(polygonAreaM2(cw)).toBeCloseTo(8, 9);
    expect(cw[1]).toEqual({ x: 0, y: -4 }); // (4,0) -> (0,-4)
  });

  it("rotatePolygon90 : horaire puis anti-horaire redonne l'original", () => {
    const r = rect(1, 1, 5, 3);
    const c = { x: 2, y: 2 };
    const back = rotatePolygon90(rotatePolygon90(r, true, c), false, c);
    back.forEach((p, i) => {
      expect(p.x).toBeCloseTo(r[i].x, 9);
      expect(p.y).toBeCloseTo(r[i].y, 9);
    });
  });

  it("resizeEdge : arête horizontale -> nouvelle longueur, voisin suit", () => {
    const r = rect(0, 0, 10, 7);       // arête 0 = bas (0,0)->(10,0), longueur 10
    const out = resizeEdge(r, 0, 6);
    expect(edgeLength(out[0], out[1])).toBeCloseTo(6, 9);
    expect(out[1]).toEqual({ x: 6, y: 0 });
    expect(out[2]).toEqual({ x: 6, y: 7 }); // voisin (arête verticale) suit
    expect(isRectilinear(out)).toBe(true);
    expect(polygonAreaM2(out)).toBeCloseTo(42, 9);
  });

  it("resizeEdge : arête verticale -> nouvelle longueur, voisin suit", () => {
    const r = rect(0, 0, 10, 7);       // arête 1 = droite (10,0)->(10,7), longueur 7
    const out = resizeEdge(r, 1, 3);
    expect(edgeLength(out[1], out[2])).toBeCloseTo(3, 9);
    expect(out[2]).toEqual({ x: 10, y: 3 });
    expect(out[3]).toEqual({ x: 0, y: 3 });
    expect(polygonAreaM2(out)).toBeCloseTo(30, 9);
  });

  it("resizeEdge : longueur invalide -> inchangé", () => {
    const r = rect(0, 0, 10, 7);
    expect(resizeEdge(r, 0, 0)).toEqual(r);
    expect(resizeEdge(r, 0, -5)).toEqual(r);
  });

  it("flattenUnion : deux rectangles accolés -> un seul rectangle, sans trou", () => {
    const f = flattenUnion([rect(0, 0, 5, 4), rect(5, 0, 5, 4)]);
    expect(f).not.toBeNull();
    expect(f.outline).toHaveLength(4);
    expect(f.holes).toHaveLength(0);
    expect(polygonAreaM2(f.outline)).toBeCloseTo(40, 9);
  });

  it("flattenUnion : formes disjointes -> null", () => {
    expect(flattenUnion([rect(0, 0, 4, 4), rect(10, 0, 4, 4)])).toBeNull();
  });

  it("flattenUnion : U + barre -> contour + 1 trou", () => {
    const f = flattenUnion([rect(0, 0, 3, 10), rect(9, 0, 3, 10), rect(0, 0, 12, 3), rect(0, 8, 12, 2)]);
    expect(f).not.toBeNull();
    expect(f.holes).toHaveLength(1);
  });
});
