"""
Seed script : met à jour prix et valeur_r des matériaux ACV
selon les standards belges du bâtiment (PEB Wallonie/Flandre).

Sources :
  - CSTC NIT 214 (conductivités thermiques des matériaux)
  - NBN EN 673 (calcul du coefficient Ug du vitrage)
  - NBN EN ISO 10077-2 (cadres de fenêtres)
  - Baromètre des prix de construction Embuild Belgique 2024

Usage :
    cd backend
    python scripts/seed_lca_prices.py
"""
import os
import sys
from pathlib import Path

# ─── Charge le .env de backend/ ─────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        # Lecture manuelle si python-dotenv absent
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("❌  Variable DATABASE_URL introuvable. Vérifiez backend/.env")

# ─── Valeurs cibles ───────────────────────────────────────────────────────────
#
# Format : (nom_exact_en_base, prix_eur_par_m2, valeur_r_m2KW)
#
# Justifications :
#
#   Mur en brique
#     λ_brique ≈ 0,80 W/mK (brique pleine standard, CSTC NIT 214)
#     épaisseur typique = 20 cm  →  R = 0,20 / 0,80 = 0,25 m²K/W
#     Prix marché belge (brique silico-calcaire + pose) : 70–110 €/m²  → 85 €/m²
#
#   Cadre de fenêtre en aluminium (à rupture de pont thermique)
#     U_cadre ≈ 2,2 W/m²K selon NBN EN ISO 10077-2  →  R = 1/2,2 ≈ 0,45 m²K/W
#     Prix cadre alu RPT hors vitrage (marché BE 2024) : 90–160 €/m²  → 120 €/m²
#
#   Double fenêtre (4-16-4 mm argon + low-e)
#     U_g ≈ 1,10 W/m²K selon NBN EN 673             →  R = 1/1,10 ≈ 0,90 m²K/W
#     Valeur exigée en rénovation PEB Wallonie depuis 2017 pour les nouvelles poses
#     Prix unité vitrée seule (BE 2024) : 85–145 €/m²  → 110 €/m²
#
#   Simple vitrage (verre clair 4 mm)
#     U_g ≈ 5,80 W/m²K (NBN EN 673, réf. PEB)       →  R = 1/5,80 ≈ 0,17 m²K/W
#     Prix verre clair 4 mm : 35–55 €/m²              → 40 €/m²
#
#   Triple vitrage (4-12-4-12-4 mm argon/krypton + double low-e)
#     U_g ≈ 0,67 W/m²K (médiane gammes AGC / Velux)  →  R = 1/0,67 ≈ 1,50 m²K/W
#     Standard construction passive en Belgique
#     Prix unité vitrée seule (BE 2024) : 220–340 €/m²  → 260 €/m²
#
UPDATES = [
    # (nom_exact,                             prix,    valeur_r)
    ("Mur en brique",                          85.0,    0.25),
    ("Cadre de fenêtre en aluminium",         120.0,    0.45),
    ("Double fenêtre",                        110.0,    0.90),
    ("Simple vitrage",                         40.0,    0.17),
    ("Triple vitrage",                        260.0,    1.50),
]

# ─── Exécution ────────────────────────────────────────────────────────────────

def main():
    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        sys.exit("❌  SQLAlchemy non installé. Lancez : pip install sqlalchemy")

    engine = create_engine(DATABASE_URL)

    print(f"\nConnexion à la base : {DATABASE_URL.split('@')[-1]}")
    print("─" * 65)

    updated_total = 0
    not_found = []

    with engine.begin() as conn:
        for name, prix, valeur_r in UPDATES:
            result = conn.execute(
                text(
                    "UPDATE lca_materials "
                    "SET prix = :prix, valeur_r = :valeur_r "
                    "WHERE name = :name"
                ),
                {"prix": prix, "valeur_r": valeur_r, "name": name},
            )
            if result.rowcount == 0:
                not_found.append(name)
                print(f"  ⚠  introuvable : {name!r}")
            else:
                updated_total += result.rowcount
                print(
                    f"  ✔  {name:<42}"
                    f"  prix = {prix:>7.2f} €/m²"
                    f"  R = {valeur_r:.2f} m²K/W"
                )

    print("─" * 65)
    print(f"  → {updated_total} matériau(x) mis à jour.")

    if not_found:
        print(
            f"\n  ⚠  {len(not_found)} matériau(x) non trouvé(s) (nom modifié ?):\n"
            + "\n".join(f"       - {n}" for n in not_found)
        )

    print()


if __name__ == "__main__":
    main()
