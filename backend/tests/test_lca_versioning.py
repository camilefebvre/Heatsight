"""
Tests d'intégration - Routes ACV versionnées (v1 / v2)
=======================================================

Couvre :
  POST /lca/materials/import         - Tests 1 à 5
  GET  /lca/materials/{id}           - Tests 6 et 7
  PATCH /projects/{id}/lca/batiments - Tests 8 à 10

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
    version="v1",
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
        "version": version,
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

    def test_01_v1_minimal_sans_dvr_ni_flux_reussit(self, client):
        """Import v1 sans DVR ni flux_reference doit réussir (200)."""
        data, files = _import_payload(version="v1")
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["dvr_materiau"] is None
        assert body["flux_reference"] is None

    def test_02_v2_mur_sans_dvr_echoue_422(self, client):
        """Import v2 catégorie Mur sans dvr_materiau doit échouer avec 422."""
        data, files = _import_payload(category="Mur", version="v2")
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 422
        assert "dvr_materiau" in resp.json()["detail"]

    def test_03_v2_isolant_dvr_sans_flux_echoue_422(self, client):
        """Import v2 catégorie Isolant avec DVR mais sans flux_reference doit échouer avec 422."""
        data, files = _import_payload(category="Isolant", version="v2", dvr_materiau=30)
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 422
        assert "flux_reference" in resp.json()["detail"]

    def test_04_v2_isolant_dvr_et_flux_reussit(self, client):
        """Import v2 catégorie Isolant avec DVR et flux_reference doit réussir (200)."""
        data, files = _import_payload(
            category="Isolant",
            version="v2",
            dvr_materiau=30,
            flux_reference=8.5,
        )
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["dvr_materiau"] == 30
        assert body["flux_reference"] == pytest.approx(8.5)

    def test_05_v2_mur_dvr_sans_flux_reussit(self, client):
        """Import v2 catégorie Mur avec DVR mais sans flux_reference doit réussir."""
        data, files = _import_payload(category="Mur", version="v2", dvr_materiau=50)
        resp = client.post("/lca/materials/import", data=data, files=files)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["dvr_materiau"] == 50
        assert body["flux_reference"] is None


# ── Tests GET /lca/materials/{id} ─────────────────────────────────────────────

class TestGetLcaMaterial:

    def test_06_lecture_materiau_legacy_v1_reussit(self, client, seed_legacy_material):
        """Lecture d'un matériau ACV 1.0 (sans DVR) via route v1 : doit réussir (200)."""
        resp = client.get(f"/lca/materials/{seed_legacy_material.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == seed_legacy_material.id
        assert body["dvr_materiau"] is None

    def test_07_lecture_materiau_legacy_v2_reussit_dvr_null(self, client, seed_legacy_material):
        """
        Lecture d'un matériau ACV 1.0 avec ?version=v2 : la route GET n'est pas
        encore versionnée - elle retourne 200 et dvr_materiau=null.
        Le frontend interprète dvr_materiau=null comme un signal "donnée incomplète ACV 2.0".
        NOTE: validation_warnings n'est pas encore implémenté dans la réponse GET.
        """
        resp = client.get(
            f"/lca/materials/{seed_legacy_material.id}",
            params={"version": "v2"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["dvr_materiau"] is None  # marqueur "legacy ACV 1.0"


# ── Tests PATCH /projects/{id}/lca/batiments ──────────────────────────────────

class TestPatchLcaBatiments:

    def test_08_v1_sans_age_batiment_reussit(self, client, seed_project):
        """PATCH v1 sans age_batiment doit réussir (rétrocompatibilité ACV 1.0)."""
        payload = {"batiments": [{"id": "bat1", "nom": "Bâtiment principal"}]}
        resp = client.patch(
            f"/projects/{seed_project.id}/lca/batiments",
            json=payload,
            params={"version": "v1"},
        )
        assert resp.status_code == 200

    def test_09_v2_sans_age_batiment_echoue_422(self, client, seed_project):
        """PATCH v2 sans age_batiment doit échouer avec 422."""
        payload = {"batiments": [{"id": "bat1", "nom": "Bâtiment principal"}]}
        resp = client.patch(
            f"/projects/{seed_project.id}/lca/batiments",
            json=payload,
            params={"version": "v2"},
        )
        assert resp.status_code == 422
        assert "age_batiment" in resp.json()["detail"]

    def test_10_v2_age_batiment_sans_dvr_applique_defaut_60(
        self, client, seed_project, db_session
    ):
        """PATCH v2 avec age_batiment sans dvr_batiment : réussit et applique dvr_batiment=60."""
        payload = {
            "batiments": [{"id": "bat1", "nom": "Bâtiment principal"}],
            "age_batiment": 15,
        }
        resp = client.patch(
            f"/projects/{seed_project.id}/lca/batiments",
            json=payload,
            params={"version": "v2"},
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
