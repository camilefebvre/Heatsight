"""
Tests d'intégration - Routes ACV (v2 uniquement)
=================================================

La v1 ACV a été retirée : le paramètre `version` n'existe plus et le
comportement v2 (DVR / flux_reference / age_batiment requis) s'applique
systématiquement.

Couvre :
  POST /lca/materials/import         - validations DVR / flux_reference
  GET  /lca/materials/{id}           - lecture (matériau legacy toléré)
  PATCH /projects/{id}/lca/batiments - age_batiment requis, dvr par défaut

Lancement :
  cd backend
  pytest tests/test_lca_versioning.py -v
"""

import pytest

from tests.conftest import make_lcia_xlsx
from app import models


# ── Helper : construit le multipart pour /lca/materials/import ────────────────

def _import_payload(
    name="Matériau test",
    category="Mur",
    functional_unit="m² de mur",
    unit="m²",
    prix=80.0,
    valeur_r=0.25,
    dvr_materiau=None,
    flux_reference=None,
    xlsx_bytes=None,
):
    if xlsx_bytes is None:
        xlsx_bytes = make_lcia_xlsx()
    data = {
        "name": name,
        "category": category,
        "functional_unit": functional_unit,
        "unit": unit,
        "prix": str(prix),
        "valeur_r": str(valeur_r),
    }
    if dvr_materiau is not None:
        data["dvr_materiau"] = str(dvr_materiau)
    if flux_reference is not None:
        data["flux_reference"] = str(flux_reference)
    files = {
        "file": (
            "lcia.xlsx",
            xlsx_bytes,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
    return data, files


# ── Tests POST /lca/materials/import ─────────────────────────────────────────

class TestImportLcaMaterial:

    def test_01_mur_sans_dvr_echoue_422(self, client):
        """Import catégorie Mur sans dvr_materiau doit échouer avec 422."""
        data, files = _import_payload(category="Mur")
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 422
        assert "dvr_materiau" in resp.json()["detail"]

    def test_02_isolant_dvr_sans_flux_echoue_422(self, client):
        """Import catégorie Isolant avec DVR mais sans flux_reference doit échouer avec 422."""
        data, files = _import_payload(category="Isolant", dvr_materiau=30)
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 422
        assert "flux_reference" in resp.json()["detail"]

    def test_03_isolant_dvr_et_flux_reussit(self, client):
        """Import catégorie Isolant avec DVR et flux_reference doit réussir (200)."""
        data, files = _import_payload(
            category="Isolant",
            dvr_materiau=30,
            flux_reference=8.5,
        )
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["dvr_materiau"] == 30
        assert body["flux_reference"] == pytest.approx(8.5)

    def test_04_mur_dvr_sans_flux_reussit(self, client):
        """Import catégorie Mur avec DVR mais sans flux_reference doit réussir."""
        data, files = _import_payload(category="Mur", dvr_materiau=50)
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["dvr_materiau"] == 50
        assert body["flux_reference"] is None


# ── Tests GET /lca/materials/{id} ─────────────────────────────────────────────

class TestGetLcaMaterial:

    def test_05_lecture_materiau_legacy_reussit(self, client, seed_legacy_material):
        """
        Lecture d'un matériau ACV 1.0 (sans DVR) : la route GET n'est pas
        versionnée, elle retourne 200 et dvr_materiau=null.
        Le frontend interprète dvr_materiau=null comme un signal "donnée incomplète".
        """
        resp = client.get(f"/lca/materials/{seed_legacy_material.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == seed_legacy_material.id
        assert body["dvr_materiau"] is None


# ── Tests PATCH /projects/{id}/lca/batiments ──────────────────────────────────

class TestPatchLcaBatiments:

    def test_06_sans_age_batiment_echoue_422(self, client, seed_project):
        """PATCH sans age_batiment doit échouer avec 422."""
        payload = {"batiments": [{"id": "bat1", "nom": "Bâtiment principal"}]}
        resp = client.patch(
            f"/projects/{seed_project.id}/lca/batiments",
            json=payload,
        )
        assert resp.status_code == 422
        assert "age_batiment" in resp.json()["detail"]

    def test_07_age_batiment_sans_dvr_applique_defaut_60(
        self, client, seed_project, db_session
    ):
        """PATCH avec age_batiment sans dvr_batiment : réussit et applique dvr_batiment=60."""
        payload = {
            "batiments": [{"id": "bat1", "nom": "Bâtiment principal"}],
            "age_batiment": 15,
        }
        resp = client.patch(
            f"/projects/{seed_project.id}/lca/batiments",
            json=payload,
        )
        assert resp.status_code == 200, resp.text

        lca = (
            db_session.query(models.LcaProject)
            .filter_by(project_id=seed_project.id)
            .first()
        )
        assert lca is not None
        assert lca.dvr_batiment == 60
        assert lca.age_batiment == 15
