"""
Supprime de la table lca_materials tous les matériaux ne respectant pas
le strict minimum requis pour les calculs ACV 2.0.

Exécution :
    cd backend
    python clean_lca_v2_invalid_materials.py
    (DATABASE_URL doit être défini dans backend/.env ou comme variable d'env)
"""

import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal
from app.models import LcaMaterial


def _norm(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s.lower())
        if unicodedata.category(c) != "Mn"
    )


def _is_numeric(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def _reasons(mat: LcaMaterial) -> list[str]:
    reasons = []

    if not mat.name or not str(mat.name).strip():
        reasons.append("name manquant")
    if not mat.category or not str(mat.category).strip():
        reasons.append("category manquante")
        return reasons  # pas de check catégorie possible

    if mat.dvr_materiau is None or mat.dvr_materiau <= 0:
        reasons.append("dvr_materiau manquant ou ≤ 0")

    impacts = mat.impacts or {}
    for key, label in [
        ("gwp100",                   "impacts.gwp100"),
        ("energy_nonrenewable_adp",  "impacts.energy_nonrenewable_adp"),
        ("photochemical_oxidant_hh", "impacts.photochemical_oxidant_hh"),
    ]:
        v = impacts.get(key)
        if v is None or not _is_numeric(v):
            reasons.append(f"{label} absent ou non numérique")

    if mat.prix is None or mat.prix < 0:
        reasons.append("prix manquant ou < 0")

    cat = _norm(mat.category)

    if cat == "isolant":
        if mat.flux_reference is None or mat.flux_reference <= 0:
            reasons.append("flux_reference ≤ 0 (Isolant)")
        if mat.valeur_r is None or mat.valeur_r <= 0:
            reasons.append("valeur_lambda ≤ 0 (Isolant)")

    elif cat in {"mur", "toiture", "plancher", "cloison", "parement"}:
        if mat.valeur_r is None or mat.valeur_r <= 0:
            reasons.append("valeur_r ≤ 0 et valeur_lambda absent (Mur/Toiture/Plancher/Cloison/Parement)")

    elif cat in {"fenetre", "vitrage"}:
        if mat.valeur_r is None or mat.valeur_r <= 0:
            reasons.append("valeur_r ≤ 0 (Vitrage/Fenêtre)")

    elif cat == "cadre":
        if mat.valeur_r is None or mat.valeur_r <= 0:
            reasons.append("valeur_r ≤ 0 (Cadre)")

    else:
        reasons.append(f"catégorie inconnue : '{mat.category}'")

    return reasons


def clean():
    try:
        db = SessionLocal()
    except Exception as exc:
        print(f"✗ Impossible de se connecter à la base : {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        all_mats = db.query(LcaMaterial).all()
        total_before = len(all_mats)
        print(f"\nBibliothèque avant : {total_before} matériaux\n")

        to_delete = []
        for mat in all_mats:
            r = _reasons(mat)
            if r:
                to_delete.append((mat, r))

        if to_delete:
            print("Suppressions :")
            for mat, r in to_delete:
                print(f"  - {mat.name} ({', '.join(r)})")
                db.delete(mat)
            db.commit()
        else:
            print("Aucun matériau invalide détecté.")

        print(f"\nTotal supprimé : {len(to_delete)}")
        print(f"Bibliothèque après : {total_before - len(to_delete)} matériaux\n")

    except Exception as exc:
        db.rollback()
        print(f"\n✗ Erreur : {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    clean()
