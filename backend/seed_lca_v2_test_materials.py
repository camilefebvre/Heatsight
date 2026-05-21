"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  ⚠  DONNÉES DE TEST — VALEURS INVENTÉES, NON SCIENTIFIQUEMENT VALIDÉES  ⚠  ║
╚══════════════════════════════════════════════════════════════════════════════╝

Ces 9 matériaux servent EXCLUSIVEMENT à faire fonctionner le moteur ACV 2.0
pendant le développement. Les valeurs GWP, énergie et santé humaine sont des
ordres de grandeur approximatifs inventés pour les tests.

AVANT TOUT USAGE DANS UN MÉMOIRE OU RAPPORT OFFICIEL :
  → Remplacer TOUTES ces valeurs par des données issues d'Activity Browser
    (base ecoinvent ou INIES), validées scientifiquement.

Le script est idempotent : peut être exécuté plusieurs fois sans doublons
(upsert sur le nom du matériau).

Exécution :
  cd backend
  python seed_lca_v2_test_materials.py
  (DATABASE_URL doit être défini dans backend/.env ou comme variable d'env)
"""

import sys
from pathlib import Path

# Permet d'importer depuis backend/app/ sans modifier PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models import LcaMaterial

# ── Convention sémantique (refonte Tâche 9) ────────────────────────────────────
# Chaque matériau utilise des colonnes dédiées avec sémantique claire :
#
#   Catégorie                | valeur_r         | valeur_lambda    | flux_reference
#   ─────────────────────────┼──────────────────┼──────────────────┼──────────────
#   Mur, Toiture, Plancher,  | R direct (m²K/W) | NULL             | NULL
#   Cloison, Parement        |                  |                  |
#   Vitrage (Fenêtre)        | R direct (m²K/W) | NULL             | NULL
#   Cadre                    | R direct (m²K/W) | NULL             | NULL
#   Isolant                  | 1.0 (référence)  | λ (W/m·K)        | flux (kg/m²·K/W)
# ─────────────────────────────────────────────────────────────────────────────

# ── Données de test ────────────────────────────────────────────────────────────
# Valeurs inventées — développement uniquement, NON validées scientifiquement.
# Clés JSONB impacts alignées sur ce que reconnaît extractImpact() dans ProjectLCA2.jsx :
#   gwp100               (kg CO₂eq)        — frontend cherche "gwp100" / "gwp_100"
#   energy_nonrenewable_adp (MJ)            — frontend cherche "energy_nonrenewable_adp" / ...
#   photochemical_oxidant_hh (kg NMVOC eq)  — frontend cherche "photochemical_oxidant_hh" / ...
# Note : les noms GWP100_TOTAL / ENERGY_NONRENEWABLE_ADP dans lca_v2_config.py désignent
# des colonnes CSV d'import, pas les clés JSONB en base — les deux espaces sont distincts.

# ── Convention ACV 2.0 — isolants ──────────────────────────────────────────────
# Convention 1 (valeur_r) : valeur_r = 1.0 pour tous les isolants (R de référence).
# Convention 2 (lambda)   : impacts["valeur_lambda"] = conductivité thermique (W/m·K).
# getLambda(m) dans ProjectLCA2.jsx lit impacts.valeur_lambda en priorité,
# puis se rabat sur valeur_r si isolant et 0 < valeur_r < 0.5 (rétrocompat.).
# Formule R : R = épaisseur_m / lambda  →  épaisseur (m) = R_cible × lambda
# Formule quantité (kg) : q = R_cible × flux_reference × surface_m²
# ────────────────────────────────────────────────────────────────────────────────

MATERIALS = [
    {
        "id": "test_v2_001",
        "name": "Mur en brique creuse",
        "category": "Mur",
        "functional_unit": "1 m² de mur (brique creuse 19 cm)",
        "unit": "m²",
        "prix": 25.0,
        "valeur_r": 0.54,          # R direct m²·K/W — brique creuse λ≈0.35 × 19 cm
        "dvr_materiau": 80,
        "flux_reference": None,
        "is_fixed": False,
        "impacts": {
            "gwp100": 35.0,
            "energy_nonrenewable_adp": 320.0,
            "photochemical_oxidant_hh": 0.085,
            "epaisseur_reference_cm": 19.0,
        },
    },
    {
        "id": "test_v2_002",
        "name": "Béton banché",
        "category": "Mur",
        "functional_unit": "1 m² de mur (béton banché 20 cm)",
        "unit": "m²",
        "prix": 80.0,
        "valeur_r": 1.33,          # R direct m²·K/W — béton banché λ≈0.15 × 20 cm
        "dvr_materiau": 80,
        "flux_reference": None,
        "is_fixed": False,
        "impacts": {
            "gwp100": 78.0,
            "energy_nonrenewable_adp": 580.0,
            "photochemical_oxidant_hh": 0.142,
            "epaisseur_reference_cm": 20.0,
        },
    },
    {
        "id": "test_v2_003",
        "name": "Laine de verre",
        "category": "Isolant",
        "functional_unit": "1 kg d'isolant",
        "unit": "kg",
        "prix": 8.0,
        "valeur_r": 1.0,       # R de référence ACV 2.0 (convention : 1 m²·K/W pour flux_reference kg/m²)
        "valeur_lambda": 0.038,  # NEW : colonne dédiée Phase 9
        "dvr_materiau": 50,
        "flux_reference": 0.47,  # kg / (m²·K/W)
        "is_fixed": False,
        "impacts": {
            "gwp100": 1.65,
            "energy_nonrenewable_adp": 42.0,
            "photochemical_oxidant_hh": 0.0058,
            "valeur_lambda": 0.038,  # conservé pour compatibilité durant transition
        },
    },
    {
        "id": "test_v2_004",
        "name": "Polyuréthane",
        "category": "Isolant",
        "functional_unit": "1 kg d'isolant",
        "unit": "kg",
        "prix": 12.0,
        "valeur_r": 1.0,       # R de référence ACV 2.0 (convention : 1 m²·K/W pour flux_reference kg/m²)
        "valeur_lambda": 0.024,  # NEW : colonne dédiée Phase 9
        "dvr_materiau": 50,
        "flux_reference": 0.72,
        "is_fixed": False,
        "impacts": {
            "gwp100": 3.85,
            "energy_nonrenewable_adp": 95.0,
            "photochemical_oxidant_hh": 0.0142,
            "valeur_lambda": 0.024,  # conservé pour compatibilité durant transition
        },
    },
    {
        "id": "test_v2_005",
        "name": "Laine de bois",
        "category": "Isolant",
        "functional_unit": "1 kg d'isolant",
        "unit": "kg",
        "prix": 15.0,
        "valeur_r": 1.0,       # R de référence ACV 2.0 (convention : 1 m²·K/W pour flux_reference kg/m²)
        "valeur_lambda": 0.045,  # NEW : colonne dédiée Phase 9
        "dvr_materiau": 60,
        "flux_reference": 2.25,
        "is_fixed": False,
        "impacts": {
            "gwp100": -0.5,   # négatif : biosourcé, séquestre du CO₂
            "energy_nonrenewable_adp": 12.0,
            "photochemical_oxidant_hh": 0.0021,
            "valeur_lambda": 0.045,  # conservé pour compatibilité durant transition
        },
    },
    {
        "id": "test_v2_006",
        "name": "Double vitrage standard",
        # Catégorie "Fenêtre" (et non "Vitrage") pour correspondre au filtre
        # isFenetreCategory() du frontend (normStr(cat) === "fenetre").
        "category": "Fenêtre",
        "functional_unit": "1 unité (fenêtre complète)",
        "unit": "unité",
        "prix": 250.0,
        "valeur_r": 0.50,
        "dvr_materiau": 30,
        "flux_reference": None,
        "is_fixed": False,
        "impacts": {
            "gwp100": 85.0,
            "energy_nonrenewable_adp": 720.0,
            "photochemical_oxidant_hh": 0.165,
        },
    },
    {
        "id": "test_v2_007",
        "name": "Triple vitrage haute performance",
        "category": "Fenêtre",
        "functional_unit": "1 unité (fenêtre complète)",
        "unit": "unité",
        "prix": 450.0,
        "valeur_r": 1.25,
        "dvr_materiau": 30,
        "flux_reference": None,
        "is_fixed": False,
        "impacts": {
            "gwp100": 140.0,
            "energy_nonrenewable_adp": 1250.0,
            "photochemical_oxidant_hh": 0.275,
        },
    },
    {
        "id": "test_v2_008",
        "name": "Cadre aluminium",
        "category": "Cadre",
        "functional_unit": "1 unité",
        "unit": "unité",
        "prix": 180.0,
        "valeur_r": 0.18,
        "dvr_materiau": 50,
        "flux_reference": None,
        "is_fixed": False,
        "impacts": {
            "gwp100": 95.0,
            "energy_nonrenewable_adp": 820.0,
            "photochemical_oxidant_hh": 0.195,
        },
    },
    {
        "id": "test_v2_009",
        "name": "Cadre bois",
        "category": "Cadre",
        "functional_unit": "1 unité",
        "unit": "unité",
        "prix": 220.0,
        "valeur_r": 0.45,
        "dvr_materiau": 40,
        "flux_reference": None,
        "is_fixed": False,
        "impacts": {
            "gwp100": 18.0,
            "energy_nonrenewable_adp": 140.0,
            "photochemical_oxidant_hh": 0.038,
        },
    },
]


def seed():
    db = SessionLocal()
    nb_create, nb_update = 0, 0

    try:
        print("\n=== Seeding ACV 2.0 — matériaux de test (⚠ valeurs inventées) ===\n")

        for data in MATERIALS:
            imp = data["impacts"]

            existing = db.query(LcaMaterial).filter(LcaMaterial.name == data["name"]).first()

            if existing:
                existing.category        = data["category"]
                existing.functional_unit = data["functional_unit"]
                existing.unit            = data["unit"]
                existing.prix            = data["prix"]
                existing.valeur_r        = data["valeur_r"]
                existing.valeur_lambda   = data.get("valeur_lambda")
                existing.dvr_materiau    = data["dvr_materiau"]
                existing.flux_reference  = data["flux_reference"]
                existing.is_fixed        = data["is_fixed"]
                existing.impacts         = data["impacts"]
                status = "UPDATE"
                nb_update += 1
            else:
                mat = LcaMaterial(
                    id               = data["id"],
                    name             = data["name"],
                    category         = data["category"],
                    functional_unit  = data["functional_unit"],
                    unit             = data["unit"],
                    prix             = data["prix"],
                    valeur_r         = data["valeur_r"],
                    valeur_lambda    = data.get("valeur_lambda"),
                    dvr_materiau     = data["dvr_materiau"],
                    flux_reference   = data["flux_reference"],
                    is_fixed         = data["is_fixed"],
                    impacts          = data["impacts"],
                )
                db.add(mat)
                status = "CREATE"
                nb_create += 1

            # Vérification des champs obligatoires
            missing = []
            for field in ("name", "category", "unit", "functional_unit"):
                if not data.get(field):
                    missing.append(field)
            for field in ("prix", "valeur_r", "dvr_materiau"):
                v = data.get(field)
                if v is None or v <= 0:
                    missing.append(field)
            for key in ("gwp100", "energy_nonrenewable_adp", "photochemical_oxidant_hh"):
                if imp.get(key) is None:
                    missing.append(f"impacts.{key}")

            is_isolant = (data["category"] or "").lower() == "isolant"
            if is_isolant and (data.get("flux_reference") is None or data["flux_reference"] <= 0):
                missing.append("flux_reference")

            cat_norm = (data["category"] or "").strip().lower()
            if cat_norm in {"mur", "toiture", "plancher", "cloison", "parement"}:
                r_label = f"R direct pour {data['category']}"
            elif cat_norm in {"vitrage", "fenêtre", "fenetre"}:
                r_label = "R direct pour Vitrage"
            elif cat_norm == "cadre":
                r_label = "R direct pour Cadre"
            else:
                r_label = "référence Convention 2"

            print(f"[{status}] {data['name']}")
            if missing:
                print(f"  ⚠ Champs manquants ou invalides : {', '.join(missing)}")
            else:
                print(f"  Champs obligatoires : tous présents ✓")
            print(f"  Prix : {data['prix']} €/{data['unit']}  valeur_r : {data['valeur_r']} ({r_label})")
            ep_ref = imp.get("epaisseur_reference_cm")
            if ep_ref is not None:
                print(f"  Épaisseur de référence FDES : {ep_ref} cm")
            print(f"  Champs ACV : gwp100={imp.get('gwp100')}  "
                  f"énergie={imp.get('energy_nonrenewable_adp')}  "
                  f"santé={imp.get('photochemical_oxidant_hh')} ✓")
            if is_isolant:
                print(f"  Champs Isolant : flux={data['flux_reference']}  λ_explicite={imp.get('valeur_lambda')} ✓")

        db.commit()
        print(f"\n✓ Terminé — {nb_create} créé(s), {nb_update} mis à jour.\n")

    except Exception as exc:
        db.rollback()
        print(f"\n✗ Erreur lors du seeding : {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
