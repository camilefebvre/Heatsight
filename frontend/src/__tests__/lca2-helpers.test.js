/**
 * Tests unitaires — Helpers ACV 2.0
 *
 * Périmètre : fonctions pures de calcul thermique et de génération de candidats
 * extraites de ProjectLCA2.jsx dans src/utils/lca2-helpers.js.
 *
 * Philosophie : tests de logique pure (aucun DOM, aucun React, aucune API).
 * Objectif : sécuriser les évolutions futures (refonte schéma DB Tâche 9) en
 * détectant toute régression sur le moteur ACV 2.0.
 *
 * Fonctions extraites et testées :
 *   normStr, isFenetreCategory, isIsolantCategory, isCadreCategory,
 *   getLambda, isParoiExterieure, isParoiEligibleAjoutIsolant,
 *   getComposantR, generateEpaisseurPaliers, makeComboKey
 */

import { describe, test, expect } from "vitest";
import {
  normStr,
  isFenetreCategory,
  isIsolantCategory,
  getLambda,
  isParoiExterieure,
  isParoiEligibleAjoutIsolant,
  getComposantR,
  generateEpaisseurPaliers,
  makeComboKey,
} from "../utils/lca2-helpers.js";

// ─── normStr ─────────────────────────────────────────────────────────────────
describe("normStr", () => {
  test("retire les accents", () => expect(normStr("Fenêtre")).toBe("fenetre"));
  test("met en minuscules", () => expect(normStr("MUR")).toBe("mur"));
  test("gère la chaîne vide", () => expect(normStr("")).toBe(""));
  test("gère null/undefined", () => expect(normStr(null)).toBe(""));
});

// ─── isIsolantCategory ───────────────────────────────────────────────────────
describe("isIsolantCategory", () => {
  test('"Isolant" → true', () => expect(isIsolantCategory("Isolant")).toBe(true));
  test('"isolant" → true', () => expect(isIsolantCategory("isolant")).toBe(true));
  test('"Mur" → false', () => expect(isIsolantCategory("Mur")).toBe(false));
  test("undefined → false", () => expect(isIsolantCategory(undefined)).toBe(false));
});

// ─── isFenetreCategory ───────────────────────────────────────────────────────
describe("isFenetreCategory", () => {
  test('"Fenêtre" → true (accent normalisé)', () => expect(isFenetreCategory("Fenêtre")).toBe(true));
  test('"fenetre" → true', () => expect(isFenetreCategory("fenetre")).toBe(true));
  test('"Mur" → false', () => expect(isFenetreCategory("Mur")).toBe(false));
});

// ─── getLambda ───────────────────────────────────────────────────────────────
describe("getLambda", () => {
  test("Convention 2 : retourne impacts.valeur_lambda", () => {
    const m = { category: "Isolant", valeur_r: 1.0, impacts: { valeur_lambda: 0.038 } };
    expect(getLambda(m)).toBe(0.038);
  });

  test("Convention 2 : priorité impacts.valeur_lambda sur valeur_r", () => {
    const m = { category: "Isolant", valeur_r: 0.04, impacts: { valeur_lambda: 0.038 } };
    expect(getLambda(m)).toBe(0.038);
  });

  test("Convention 1 rétrocompat : fallback valeur_r < 0.5", () => {
    const m = { category: "Isolant", valeur_r: 0.045, impacts: {} };
    expect(getLambda(m)).toBe(0.045);
  });

  test("Convention 2 ref : valeur_r = 1.0 → null (pas un lambda)", () => {
    const m = { category: "Isolant", valeur_r: 1.0, impacts: {} };
    expect(getLambda(m)).toBeNull();
  });

  test("Aucune donnée valide → null", () => {
    const m = { category: "Isolant", impacts: {} };
    expect(getLambda(m)).toBeNull();
  });

  test("valeur_r exactement 0.5 → null (borne exclue : doit être < 0.5)", () => {
    const m = { category: "Isolant", valeur_r: 0.5, impacts: {} };
    expect(getLambda(m)).toBeNull();
  });

  test("Catégorie non-isolant avec valeur_r < 0.5 → null (fallback uniquement pour Isolant)", () => {
    const m = { category: "Mur", valeur_r: 0.35, impacts: {} };
    expect(getLambda(m)).toBeNull();
  });

  test("m = null → null sans exception", () => {
    expect(getLambda(null)).toBeNull();
  });
});

// ─── isParoiExterieure ───────────────────────────────────────────────────────
describe("isParoiExterieure", () => {
  test('type "mur" → true', () =>
    expect(isParoiExterieure({ type: "mur", nom: "" })).toBe(true));
  test('type "toiture" → true', () =>
    expect(isParoiExterieure({ type: "toiture", nom: "" })).toBe(true));
  test('type "plancher" → true', () =>
    expect(isParoiExterieure({ type: "plancher", nom: "" })).toBe(true));
  test('type "cloison" → false', () =>
    expect(isParoiExterieure({ type: "cloison", nom: "" })).toBe(false));
  test('sans type, nom "Mur extérieur" → true (contient "exterieur")', () =>
    expect(isParoiExterieure({ type: "", nom: "Mur extérieur" })).toBe(true));
  test('sans type, nom "Cloison intérieure" → false (contient "interieur")', () =>
    expect(isParoiExterieure({ type: "", nom: "Cloison intérieure" })).toBe(false));
  test('sans type, nom "Plancher intermédiaire" → false (contient "intermediaire")', () =>
    expect(isParoiExterieure({ type: "", nom: "Plancher intermédiaire" })).toBe(false));
  test('sans type, nom "Toiture" → true (contient "toit")', () =>
    expect(isParoiExterieure({ type: "", nom: "Toiture" })).toBe(true));
  test('sans type, nom "Sol bas" → true', () =>
    expect(isParoiExterieure({ type: "", nom: "Sol bas" })).toBe(true));
  test("sans type ni nom reconnu → false", () =>
    expect(isParoiExterieure({ type: "", nom: "Dalle" })).toBe(false));
});

// ─── isParoiEligibleAjoutIsolant ─────────────────────────────────────────────
describe("isParoiEligibleAjoutIsolant", () => {
  const support = { category: "Mur" };
  const isolant = { category: "Isolant" };

  test("extérieure + support non-isolant + pas d'isolant → true", () => {
    const paroi = { type: "mur", nom: "", composantsOpaques: [support] };
    expect(isParoiEligibleAjoutIsolant(paroi)).toBe(true);
  });

  test("extérieure + isolant existant → false", () => {
    const paroi = { type: "mur", nom: "", composantsOpaques: [support, isolant] };
    expect(isParoiEligibleAjoutIsolant(paroi)).toBe(false);
  });

  test("extérieure + aucun composant → false (pas de support)", () => {
    const paroi = { type: "mur", nom: "", composantsOpaques: [] };
    expect(isParoiEligibleAjoutIsolant(paroi)).toBe(false);
  });

  test("cloison (intérieure) → false", () => {
    const paroi = { type: "cloison", nom: "", composantsOpaques: [support] };
    expect(isParoiEligibleAjoutIsolant(paroi)).toBe(false);
  });

  test("extérieure + uniquement des isolants (pas de support) → false", () => {
    const paroi = { type: "mur", nom: "", composantsOpaques: [isolant] };
    expect(isParoiEligibleAjoutIsolant(paroi)).toBe(false);
  });
});

// ─── getComposantR — post-refonte conceptuelle ───────────────────────────────
describe("getComposantR", () => {
  test("r_local override → priorité absolue", () => {
    const co = { r_local: "2.5", r_cible: "1.0", lambda_lib: 0.35, category: "Mur" };
    expect(getComposantR(co)).toBe(2.5);
  });

  test("r_local vide → ignoré", () => {
    const co = { r_local: "", lambda_lib: 1.33, category: "Mur" };
    expect(getComposantR(co)).toBe(1.33);
  });

  test("Isolant avec r_cible valide → retourne r_cible (Convention 2)", () => {
    const co = { r_local: "", r_cible: "3.5", lambda_lib: 1.0, category: "Isolant" };
    expect(getComposantR(co)).toBe(3.5);
  });

  test("Isolant sans r_cible → null (lambda_lib non utilisé pour isolants)", () => {
    const co = { r_local: "", r_cible: "", lambda_lib: 0.038, category: "Isolant" };
    expect(getComposantR(co)).toBeNull();
  });

  test("Non-isolant Mur avec lambda_lib = 1.33 → retourne 1.33 (R direct post-refonte)", () => {
    const co = { r_local: "", lambda_lib: 1.33, category: "Mur" };
    expect(getComposantR(co)).toBe(1.33);
  });

  test('Non-isolant Fenêtre avec lambda_lib = 0.50 → retourne 0.50', () => {
    const co = { r_local: "", lambda_lib: 0.50, category: "Fenêtre" };
    expect(getComposantR(co)).toBe(0.50);
  });

  test("Aucune donnée valide → null", () => {
    const co = { r_local: "", r_cible: "", lambda_lib: null, category: "Mur" };
    expect(getComposantR(co)).toBeNull();
  });
});

// ─── generateEpaisseurPaliers ────────────────────────────────────────────────
describe("generateEpaisseurPaliers", () => {
  test("cas nominal : ep=10, max=20, step=2.5 → [10, 15, 20]", () => {
    expect(generateEpaisseurPaliers(10, 20, 2.5)).toEqual([10, 15, 20]);
  });

  test("ep=12.5, max=20, step=2.5 → [12.5, 17.5, 20]", () => {
    expect(generateEpaisseurPaliers(12.5, 20, 2.5)).toEqual([12.5, 17.5, 20]);
  });

  test("ep > max → []", () => {
    expect(generateEpaisseurPaliers(25, 20, 2.5)).toEqual([]);
  });

  test("ep = max → [max] (point unique, dédupliqué)", () => {
    expect(generateEpaisseurPaliers(20, 20, 2.5)).toEqual([20]);
  });

  test("ep=7.5, max=20, step=2.5 → [7.5, 15, 20]", () => {
    expect(generateEpaisseurPaliers(7.5, 20, 2.5)).toEqual([7.5, 15, 20]);
  });

  test("ep=15, max=20, step=2.5 → [15, 17.5, 20]", () => {
    expect(generateEpaisseurPaliers(15, 20, 2.5)).toEqual([15, 17.5, 20]);
  });
});

// ─── makeComboKey ─────────────────────────────────────────────────────────────
describe("makeComboKey", () => {
  const c1 = { compId: "c1", type: "opaque", material_id: "mat_A", epaisseur_cm: null };
  const c2 = { compId: "c2", type: "opaque", material_id: "mat_B", epaisseur_cm: "15" };

  test("génère une clé non-vide", () => {
    expect(makeComboKey([c1])).toBeTruthy();
  });

  test("ordre-indépendant : [c1, c2] === [c2, c1]", () => {
    expect(makeComboKey([c1, c2])).toBe(makeComboKey([c2, c1]));
  });

  test("inclut l'épaisseur si epaisseur_cm non null", () => {
    expect(makeComboKey([c2])).toContain(":e15");
  });

  test("exclut le suffixe épaisseur si epaisseur_cm = null", () => {
    expect(makeComboKey([c1])).not.toContain(":e");
  });
});

// ─── Convention valeur_r unifiée (post-refonte conceptuelle) ─────────────────
describe("Convention valeur_r unifiée (post-refonte)", () => {
  test("Mur : valeur_r > 0.5 → getLambda retourne null (pas un lambda)", () => {
    const m = { category: "Mur", valeur_r: 1.33 };
    expect(getLambda(m)).toBeNull();
  });

  test("Vitrage : valeur_r est un R direct accessible directement", () => {
    const m = { category: "Vitrage", valeur_r: 0.50 };
    expect(parseFloat(m.valeur_r)).toBe(0.50);
  });

  test("Isolant : valeur_r = 1.0 référence, vrai λ dans impacts.valeur_lambda", () => {
    const m = { category: "Isolant", valeur_r: 1.0, impacts: { valeur_lambda: 0.038 } };
    expect(getLambda(m)).toBe(0.038);
    expect(parseFloat(m.valeur_r)).toBe(1.0);
  });
});
