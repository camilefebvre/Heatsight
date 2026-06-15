"""
Fixtures partagées pour les tests d'intégration HeatSight.

Base de données : SQLite en mémoire - aucune configuration externe requise.

Lancement :
  cd backend
  pytest tests/test_lca_versioning.py -v
"""

import io
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import get_db
from app.main import app, get_current_user
from app import models
from app.models import Base


# ── Patch JSONB → JSON pour compatibilité SQLite ──────────────────────────────

def _patch_jsonb_for_sqlite() -> None:
    """Remplace les colonnes JSONB (PostgreSQL-only) par JSON générique."""
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, JSONB):
                column.type = JSON()


# ── Engine SQLite en mémoire (session-scope) ──────────────────────────────────

@pytest.fixture(scope="session")
def test_engine():
    _patch_jsonb_for_sqlite()
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,   # connexion unique partagée → même DB en mémoire
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


# ── Session DB (function-scope) ───────────────────────────────────────────────

@pytest.fixture(scope="function")
def db_session(test_engine):
    Session = sessionmaker(bind=test_engine)
    session = Session()
    yield session
    session.close()


# ── Utilisateur de test (session-scope : créé une seule fois) ─────────────────

_TEST_USER_ID = "test-user-heatsight-000"


@pytest.fixture(scope="session")
def test_user(test_engine):
    Session = sessionmaker(bind=test_engine)
    session = Session()
    if not session.get(models.User, _TEST_USER_ID):
        session.add(models.User(
            id=_TEST_USER_ID,
            full_name="Test User",
            email="test@heatsight-test.internal",
            hashed_password="unused-in-tests",
        ))
        session.commit()
    session.close()
    return _TEST_USER_ID


# ── Client FastAPI (function-scope) ──────────────────────────────────────────

@pytest.fixture(scope="function")
def client(db_session, test_user):
    def _override_get_db():
        yield db_session

    def _override_get_current_user():
        return models.User(
            id=test_user,
            full_name="Test User",
            email="test@heatsight-test.internal",
            hashed_password="unused",
        )

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Seed : projet minimal (function-scope, UUID unique) ───────────────────────

@pytest.fixture(scope="function")
def seed_project(db_session, test_user):
    project = models.Project(
        id=f"test-proj-{uuid4().hex[:12]}",
        owner_id=test_user,
        project_name="Projet test ACV",
        client_name="Client test",
        client_email="client@test.com",
        building_address="1 rue de la Paix, Bruxelles",
        building_type="Résidentiel",
        audit_type="Complet",
        excel_file="test_project.xlsx",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db_session.add(project)
    db_session.commit()
    return project


# ── Seed : matériau legacy ACV 1.0 (function-scope, UUID unique) ─────────────

@pytest.fixture(scope="function")
def seed_legacy_material(db_session):
    material = models.LcaMaterial(
        id=f"legacy-mat-{uuid4().hex[:12]}",
        name="Mur béton legacy",
        category="Mur",
        functional_unit="m² de mur",
        unit="m²",
        impacts={"gwp100": 120.0, "energy_nonrenewable": 800.0},
        prix=85.0,
        valeur_r=0.25,
        is_fixed=False,
        flux_reference=None,
        dvr_materiau=None,
    )
    db_session.add(material)
    db_session.commit()
    return material


# ── Helper XLSX ───────────────────────────────────────────────────────────────

def make_lcia_xlsx(gwp100: float = 100.0) -> bytes:
    """
    Fichier XLSX minimal reconnu par _parse_lcia_xlsx.
    Contient l'indicateur GWP100 (EF v3.0) avec une valeur numérique.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Results"
    ws.append([
        "Method",
        "Climate change: total (EF v3.0 - IPCC 2013) | "
        "global warming potential (GWP100)",
    ])
    ws.append(["Total", gwp100])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
