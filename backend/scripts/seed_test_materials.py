#!/usr/bin/env python3
"""
Seed script — insère des matériaux de test réalistes pour chaque catégorie LCA.

Usage (depuis backend/) :
    python scripts/seed_test_materials.py

Le script est idempotent : il vérifie l'existence par nom avant chaque insertion
et ne crée pas de doublon si relancé plusieurs fois.

Valeurs d'impact : conformes aux ordres de grandeur EF v3.0 / ecoinvent v3.9 /
FDES françaises (INIES) et EPD belges.  Les 16 catégories non spécifiées sont
estimées par ratios proportionnels au GWP100, différenciés par type de matériau.
"""

import sys
import os
from pathlib import Path

# Ajouter backend/ au sys.path pour que "from app.xxx" fonctionne
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from uuid import uuid4
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.database import SessionLocal
from app.models import LcaMaterial


# ─── Ratios EF v3.0 par type de matériau ──────────────────────────────────────
# Chaque ratio est appliqué à gwp100 (kg CO₂eq/unité fonctionnelle).
# Sources : ecoinvent v3.9, INIES 2024, EPD belges EN 15804+A2.

_MINERAL = {
    # Minéraux (béton, brique, céramique, plâtre)
    "eutrophication_fw":           1.8e-4,   # kg P eq
    "eutrophication_marine":       1.4e-3,   # kg N eq
    "eutrophication_terrestrial":  8.5e-3,   # mol N eq
    "human_tox_carc":              1.5e-7,   # CTUh
    "human_tox_noncarc":           8.5e-7,   # CTUh
    "ionising_radiation":          0.55,     # kBq U235 eq
    "land_use":                    0.12,     # Pt
    "material_resources":          2.2,      # MJ
    "ozone_depletion":             1.1e-8,   # kg CFC-11 eq
    "particulate_matter":          1.5e-5,   # disease inc.
    "photochemical_oxidant":       1.3e-3,   # kg NMVOC eq
    "water_use":                   0.18,     # m³ world equiv.
    "climate_biogenic":            0.008,    # fraction de gwp100
    "climate_fossil":              0.94,
    "climate_landuse":             0.003,
    "ecotoxicity_fw":              0.42,     # CTUe
}

_MINERAL_FIBER = {
    # Fibres minérales (laine de verre, laine de roche)
    "eutrophication_fw":           1.5e-4,
    "eutrophication_marine":       1.2e-3,
    "eutrophication_terrestrial":  7.5e-3,
    "human_tox_carc":              1.6e-7,
    "human_tox_noncarc":           8.8e-7,
    "ionising_radiation":          0.65,
    "land_use":                    0.08,
    "material_resources":          1.8,
    "ozone_depletion":             8.5e-9,
    "particulate_matter":          1.9e-5,
    "photochemical_oxidant":       1.4e-3,
    "water_use":                   0.12,
    "climate_biogenic":            0.005,
    "climate_fossil":              0.95,
    "climate_landuse":             0.002,
    "ecotoxicity_fw":              0.38,
}

_POLYMER = {
    # Polymères (PVC, EPS, EPDM)
    "eutrophication_fw":           1.0e-4,
    "eutrophication_marine":       8.5e-4,
    "eutrophication_terrestrial":  5.5e-3,
    "human_tox_carc":              2.2e-7,
    "human_tox_noncarc":           1.1e-6,
    "ionising_radiation":          0.42,
    "land_use":                    0.04,
    "material_resources":          3.5,
    "ozone_depletion":             9.5e-9,
    "particulate_matter":          1.1e-5,
    "photochemical_oxidant":       1.6e-3,
    "water_use":                   0.07,
    "climate_biogenic":            0.002,
    "climate_fossil":              0.97,
    "climate_landuse":             0.001,
    "ecotoxicity_fw":              0.58,
}

_METAL = {
    # Métaux (acier, aluminium)
    "eutrophication_fw":           2.4e-4,
    "eutrophication_marine":       1.9e-3,
    "eutrophication_terrestrial":  1.15e-2,
    "human_tox_carc":              3.2e-7,
    "human_tox_noncarc":           1.7e-6,
    "ionising_radiation":          1.15,
    "land_use":                    0.14,
    "material_resources":          4.2,
    "ozone_depletion":             1.6e-8,
    "particulate_matter":          2.2e-5,
    "photochemical_oxidant":       1.9e-3,
    "water_use":                   0.22,
    "climate_biogenic":            0.003,
    "climate_fossil":              0.96,
    "climate_landuse":             0.002,
    "ecotoxicity_fw":              0.82,
}

_BIO_BASED = {
    # Bio-sourcés (bois massif, OSB, pin) — stockage carbone → climate_biogenic négatif
    "eutrophication_fw":           1.3e-4,
    "eutrophication_marine":       1.0e-3,
    "eutrophication_terrestrial":  6.5e-3,
    "human_tox_carc":              1.1e-7,
    "human_tox_noncarc":           6.0e-7,
    "ionising_radiation":          0.35,
    "land_use":                    2.8,      # élevé pour les bio-sourcés
    "material_resources":          0.28,
    "ozone_depletion":             7.0e-9,
    "particulate_matter":          1.8e-5,
    "photochemical_oxidant":       2.4e-3,
    "water_use":                   0.25,
    "climate_biogenic":           -0.42,    # séquestration carbone
    "climate_fossil":              0.52,
    "climate_landuse":             0.09,
    "ecotoxicity_fw":              0.25,
}

_GLASS = {
    # Verre (brique de verre, vitrages)
    "eutrophication_fw":           1.7e-4,
    "eutrophication_marine":       1.4e-3,
    "eutrophication_terrestrial":  8.5e-3,
    "human_tox_carc":              1.8e-7,
    "human_tox_noncarc":           9.2e-7,
    "ionising_radiation":          0.68,
    "land_use":                    0.05,
    "material_resources":          1.9,
    "ozone_depletion":             9.8e-9,
    "particulate_matter":          1.6e-5,
    "photochemical_oxidant":       1.5e-3,
    "water_use":                   0.19,
    "climate_biogenic":            0.006,
    "climate_fossil":              0.93,
    "climate_landuse":             0.002,
    "ecotoxicity_fw":              0.44,
}


def _build_impacts(gwp100: float, energy_nr: float, acidification: float, ratios: dict) -> dict:
    """Construit le dict d'impacts complet EF v3.0 à partir des 3 valeurs saisies
    et des ratios proportionnels pour les 16 catégories restantes."""
    d = {
        "gwp100":        round(gwp100,        4),
        "energy_nr":     round(energy_nr,     2),
        "acidification": round(acidification, 5),
    }
    for key, ratio in ratios.items():
        d[key] = round(gwp100 * ratio, 8)
    return d


# ─── Catalogue des matériaux à insérer ────────────────────────────────────────
# Champs : name, category, functional_unit, unit,
#          gwp100, energy_nr, acidification, ratios,
#          prix, valeur_r (λ pour opaques, R pour fenêtres),
#          flux_reference (kg/m²·K/W, isolants uniquement)

MATERIALS = [

    # ── Mur ───────────────────────────────────────────────────────────────────
    dict(
        name="Bloc béton cellulaire (aircrete)",
        category="Mur",
        functional_unit="m² de mur",
        unit="m²",
        gwp100=45.0, energy_nr=380.0, acidification=0.08,
        ratios=_MINERAL,
        prix=8.0,
        valeur_r=0.11,       # λ en W/m·K
        flux_reference=0.6,  # kg/m²·K/W
    ),
    dict(
        name="Brique de terre cuite",
        category="Mur",
        functional_unit="m² de mur",
        unit="m²",
        gwp100=80.0, energy_nr=620.0, acidification=0.12,
        ratios=_MINERAL,
        prix=35.0,
        valeur_r=0.5,
        flux_reference=None,
    ),
    dict(
        name="Béton banché",
        category="Mur",
        functional_unit="m² de mur",
        unit="m²",
        gwp100=210.0, energy_nr=1100.0, acidification=0.25,
        ratios=_MINERAL,
        prix=55.0,
        valeur_r=2.0,
        flux_reference=None,
    ),

    # ── Isolant ───────────────────────────────────────────────────────────────
    # Catégorie non listée dans CATEGORY_ORDER frontend → traitée comme opaque
    # (isFenetreCategory = False, cat != "Autre" → isOpaque = True dans InlineCompForm)
    dict(
        name="Laine de verre en vrac",
        category="Isolant",
        functional_unit="m² d'isolation",
        unit="m²",
        gwp100=22.0, energy_nr=280.0, acidification=0.05,
        ratios=_MINERAL_FIBER,
        prix=12.0,
        valeur_r=0.04,       # λ
        flux_reference=0.57,
    ),
    dict(
        name="Laine de roche panneau",
        category="Isolant",
        functional_unit="m² d'isolation",
        unit="m²",
        gwp100=18.0, energy_nr=240.0, acidification=0.04,
        ratios=_MINERAL_FIBER,
        prix=18.0,
        valeur_r=0.035,
        flux_reference=0.48,
    ),
    dict(
        name="Polystyrène expansé EPS",
        category="Isolant",
        functional_unit="m² d'isolation",
        unit="m²",
        gwp100=55.0, energy_nr=1050.0, acidification=0.09,
        ratios=_POLYMER,
        prix=14.0,
        valeur_r=0.038,
        flux_reference=0.32,
    ),

    # ── Toiture ───────────────────────────────────────────────────────────────
    dict(
        name="Tuile en terre cuite",
        category="Toiture",
        functional_unit="m² de toiture",
        unit="m²",
        gwp100=95.0, energy_nr=780.0, acidification=0.15,
        ratios=_MINERAL,
        prix=25.0,
        valeur_r=None,       # élément de couverture sans λ dominant
        flux_reference=None,
    ),
    dict(
        name="Membrane EPDM",
        category="Toiture",
        functional_unit="m² de toiture",
        unit="m²",
        gwp100=120.0, energy_nr=1800.0, acidification=0.22,
        ratios=_POLYMER,
        prix=18.0,
        valeur_r=None,
        flux_reference=None,
    ),
    dict(
        name="Bac acier",
        category="Toiture",
        functional_unit="m² de toiture",
        unit="m²",
        gwp100=85.0, energy_nr=1100.0, acidification=0.18,
        ratios=_METAL,
        prix=22.0,
        valeur_r=None,
        flux_reference=None,
    ),

    # ── Plancher ──────────────────────────────────────────────────────────────
    dict(
        name="Dalle béton 15 cm",
        category="Plancher",
        functional_unit="m² de plancher",
        unit="m²",
        gwp100=180.0, energy_nr=950.0, acidification=0.20,
        ratios=_MINERAL,
        prix=45.0,
        valeur_r=2.0,
        flux_reference=None,
    ),
    dict(
        name="Parquet chêne massif",
        category="Plancher",
        functional_unit="m² de plancher",
        unit="m²",
        gwp100=12.0, energy_nr=180.0, acidification=0.03,
        ratios=_BIO_BASED,
        prix=65.0,
        valeur_r=0.18,
        flux_reference=None,
    ),
    dict(
        name="Carrelage grès cérame",
        category="Plancher",
        functional_unit="m² de plancher",
        unit="m²",
        gwp100=75.0, energy_nr=650.0, acidification=0.14,
        ratios=_MINERAL,
        prix=35.0,
        valeur_r=1.05,
        flux_reference=None,
    ),

    # ── Cloison ───────────────────────────────────────────────────────────────
    dict(
        name="Plaque plâtre BA13",
        category="Cloison",
        functional_unit="m² de cloison",
        unit="m²",
        gwp100=28.0, energy_nr=320.0, acidification=0.06,
        ratios=_MINERAL,
        prix=12.0,
        valeur_r=0.25,
        flux_reference=None,
    ),
    dict(
        name="Brique de verre",
        category="Cloison",
        functional_unit="m² de cloison",
        unit="m²",
        gwp100=95.0, energy_nr=820.0, acidification=0.16,
        ratios=_GLASS,
        prix=85.0,
        valeur_r=0.76,
        flux_reference=None,
    ),
    dict(
        name="Cloison bois OSB",
        category="Cloison",
        functional_unit="m² de cloison",
        unit="m²",
        gwp100=15.0, energy_nr=210.0, acidification=0.04,
        ratios=_BIO_BASED,
        prix=28.0,
        valeur_r=0.13,
        flux_reference=None,
    ),

    # ── Fenêtre ───────────────────────────────────────────────────────────────
    # valeur_r = R global (m²K/W) — convention pour les baies vitrées
    dict(
        name="Fenêtre PVC double vitrage",
        category="Fenêtre",
        functional_unit="fenêtre installée",
        unit="unité",
        gwp100=85.0, energy_nr=1200.0, acidification=0.18,
        ratios=_POLYMER,
        prix=180.0,
        valeur_r=0.91,       # R global → U ≈ 1.1 W/m²K
        flux_reference=None,
    ),
    dict(
        name="Fenêtre bois triple vitrage",
        category="Fenêtre",
        functional_unit="fenêtre installée",
        unit="unité",
        gwp100=65.0, energy_nr=980.0, acidification=0.14,
        ratios=_BIO_BASED,
        prix=320.0,
        valeur_r=1.25,       # R → U ≈ 0.8 W/m²K
        flux_reference=None,
    ),
    dict(
        name="Velux triple vitrage",
        category="Fenêtre",
        functional_unit="fenêtre de toit installée",
        unit="unité",
        gwp100=72.0, energy_nr=1050.0, acidification=0.16,
        ratios=_POLYMER,
        prix=450.0,
        valeur_r=1.11,       # R → U ≈ 0.9 W/m²K
        flux_reference=None,
    ),

    # ── Cadre ─────────────────────────────────────────────────────────────────
    dict(
        name="Cadre PVC",
        category="Cadre",
        functional_unit="m² de cadre",
        unit="m²",
        gwp100=38.0, energy_nr=580.0, acidification=0.08,
        ratios=_POLYMER,
        prix=45.0,
        valeur_r=0.17,       # λ
        flux_reference=None,
    ),
    dict(
        name="Cadre aluminium coupure thermique",
        category="Cadre",
        functional_unit="m² de cadre",
        unit="m²",
        gwp100=125.0, energy_nr=1850.0, acidification=0.32,
        ratios=_METAL,
        prix=85.0,
        valeur_r=0.3,
        flux_reference=None,
    ),
    dict(
        name="Cadre bois pin",
        category="Cadre",
        functional_unit="m² de cadre",
        unit="m²",
        gwp100=8.0, energy_nr=120.0, acidification=0.02,
        ratios=_BIO_BASED,
        prix=55.0,
        valeur_r=0.13,
        flux_reference=None,
    ),
    # ── Batch 2 ──────────────────────────────────────────────────────────────
    # Mur
    dict(
        name="Mur en pisé",
        category="Mur",
        functional_unit="m² de mur",
        unit="m²",
        gwp100=8.0, energy_nr=95.0, acidification=0.02,
        ratios=_MINERAL,
        prix=60.0,
        valeur_r=0.81,       # λ (W/m·K)
        flux_reference=None,
    ),
    dict(
        name="Mur en bois massif CLT",
        category="Mur",
        functional_unit="m² de mur",
        unit="m²",
        gwp100=-20.0, energy_nr=180.0, acidification=0.03,
        ratios=_BIO_BASED,
        prix=95.0,
        valeur_r=0.13,       # λ (W/m·K)
        flux_reference=None,
    ),
    # Isolant
    dict(
        name="Fibre de bois panneau",
        category="Isolant",
        functional_unit="m² de paroi isolée (R=1 m²K/W)",
        unit="m²",
        gwp100=-15.0, energy_nr=200.0, acidification=0.04,
        ratios=_BIO_BASED,
        prix=18.0,
        valeur_r=0.038,      # λ (W/m·K)
        flux_reference=0.52,
    ),
    dict(
        name="Liège expansé",
        category="Isolant",
        functional_unit="m² de paroi isolée (R=1 m²K/W)",
        unit="m²",
        gwp100=10.0, energy_nr=220.0, acidification=0.03,
        ratios=_BIO_BASED,
        prix=22.0,
        valeur_r=0.040,      # λ (W/m·K)
        flux_reference=0.45,
    ),
    # Toiture
    dict(
        name="Toiture verte extensive",
        category="Toiture",
        functional_unit="m² de toiture",
        unit="m²",
        gwp100=35.0, energy_nr=320.0, acidification=0.07,
        ratios=_MINERAL,
        prix=80.0,
        valeur_r=None,
        flux_reference=None,
    ),
    dict(
        name="Ardoise naturelle",
        category="Toiture",
        functional_unit="m² de toiture",
        unit="m²",
        gwp100=48.0, energy_nr=410.0, acidification=0.09,
        ratios=_MINERAL,
        prix=65.0,
        valeur_r=None,
        flux_reference=None,
    ),
    # Plancher
    dict(
        name="Chape anhydrite",
        category="Plancher",
        functional_unit="m² de plancher",
        unit="m²",
        gwp100=95.0, energy_nr=520.0, acidification=0.14,
        ratios=_MINERAL,
        prix=30.0,
        valeur_r=1.2,        # λ (W/m·K)
        flux_reference=None,
    ),
    dict(
        name="Bambou massif",
        category="Plancher",
        functional_unit="m² de plancher",
        unit="m²",
        gwp100=5.0, energy_nr=140.0, acidification=0.02,
        ratios=_BIO_BASED,
        prix=45.0,
        valeur_r=0.17,       # λ (W/m·K)
        flux_reference=None,
    ),
    # Cloison
    dict(
        name="Cloison béton cellulaire",
        category="Cloison",
        functional_unit="m² de cloison",
        unit="m²",
        gwp100=32.0, energy_nr=280.0, acidification=0.06,
        ratios=_MINERAL,
        prix=35.0,
        valeur_r=0.11,       # λ (W/m·K)
        flux_reference=None,
    ),
    dict(
        name="Cloison terre crue",
        category="Cloison",
        functional_unit="m² de cloison",
        unit="m²",
        gwp100=5.0, energy_nr=70.0, acidification=0.01,
        ratios=_MINERAL,
        prix=28.0,
        valeur_r=0.81,       # λ (W/m·K)
        flux_reference=None,
    ),
    # Fenêtre
    dict(
        name="Fenêtre acier double vitrage",
        category="Fenêtre",
        functional_unit="m² de baie vitrée",
        unit="m²",
        gwp100=145.0, energy_nr=1950.0, acidification=0.38,
        ratios=_METAL,
        prix=480.0,
        valeur_r=0.77,       # R (m²K/W) pour les fenêtres
        flux_reference=None,
    ),
    # Cadre
    dict(
        name="Cadre acier thermolaqué",
        category="Cadre",
        functional_unit="m² de cadre",
        unit="m²",
        gwp100=168.0, energy_nr=2200.0, acidification=0.44,
        ratios=_METAL,
        prix=110.0,
        valeur_r=0.35,       # λ (W/m·K)
        flux_reference=None,
    ),
]


# ─── Insertion ────────────────────────────────────────────────────────────────

def main() -> None:
    db = SessionLocal()
    inserted = 0
    skipped = 0

    try:
        for spec in MATERIALS:
            # Vérification anti-doublon par nom exact
            exists = db.query(LcaMaterial).filter(LcaMaterial.name == spec["name"]).first()
            if exists:
                print(f"  SKIP  [{spec['category']:10s}] {spec['name']}")
                skipped += 1
                continue

            impacts = _build_impacts(
                gwp100=spec["gwp100"],
                energy_nr=spec["energy_nr"],
                acidification=spec["acidification"],
                ratios=spec["ratios"],
            )

            mat = LcaMaterial(
                id=str(uuid4()),
                name=spec["name"],
                category=spec["category"],
                functional_unit=spec["functional_unit"],
                unit=spec["unit"],
                impacts=impacts,
                prix=spec.get("prix"),
                valeur_r=spec.get("valeur_r"),
                is_fixed=False,
                flux_reference=spec.get("flux_reference"),
            )
            db.add(mat)
            db.flush()   # obtenir l'id avant le commit
            print(f"  INSERT [{spec['category']:10s}] {spec['name']}")
            inserted += 1

        db.commit()
        print(f"\n✓ Terminé — {inserted} inséré(s), {skipped} ignoré(s) (déjà présents).")

    except Exception as exc:
        db.rollback()
        print(f"\n✗ Erreur — rollback effectué.\n{exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
