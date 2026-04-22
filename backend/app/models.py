from sqlalchemy import Column, String, Float, Integer, Boolean, UniqueConstraint, ForeignKey, LargeBinary
from sqlalchemy.dialects.postgresql import JSONB

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    hashed_password = Column(String, nullable=False)


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    project_name = Column(String, nullable=False)
    client_name = Column(String, nullable=False)
    client_email = Column(String, nullable=False)
    client_phone = Column(String, nullable=True)
    building_address = Column(String, nullable=False)
    building_type = Column(String, nullable=False)
    audit_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="draft")
    excel_file = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    excel_summary = Column(JSONB, nullable=True)      # résumé importé depuis AMUREBA (import-excel)
    prefill_summary = Column(JSONB, nullable=True)    # actions proposées par Claude (prefill-excel)
    prefilled_excel = Column(LargeBinary, nullable=True)  # fichier xlsx généré par prefill-excel
    prefilled_at = Column(String, nullable=True)      # ISO datetime du dernier prefill
    # audit_data, energy_accounting, report_data → tables dédiées


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    start = Column(String, nullable=False)          # ISO datetime
    duration_min = Column(Integer, nullable=True)
    location = Column(String, nullable=True)
    project_id = Column(
        String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    notes = Column(String, nullable=True)


class ClientRequest(Base):
    __tablename__ = "client_requests"

    id = Column(String, primary_key=True)
    project_id = Column(
        String, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    client_email = Column(String, nullable=False)
    message = Column(String, nullable=True)
    status = Column(String, nullable=False, default="sent")
    sent_at = Column(String, nullable=True)
    documents = Column(JSONB, nullable=True, default=list)   # [{id, label, received}]
    feedback = Column(String, nullable=True)
    received_files = Column(JSONB, nullable=True, default=list)  # [{name, size}]


class EnergyRecord(Base):
    """Une ligne = une année de compta énergie pour un projet."""
    __tablename__ = "energy_accounting"

    id = Column(String, primary_key=True)
    project_id = Column(
        String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    year = Column(String, nullable=False)
    electricity = Column(Float, nullable=True)
    gas = Column(Float, nullable=True)
    fuel = Column(Float, nullable=True)
    biogas = Column(Float, nullable=True)
    utility1 = Column(Float, nullable=True)
    utility2 = Column(Float, nullable=True)
    process = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    details = Column(JSONB, nullable=True)        # breakdown by section (operational, buildings, …)
    field_sources = Column(JSONB, nullable=True)  # { field: { source, doc_name, doc_id } }

    __table_args__ = (
        UniqueConstraint("project_id", "year", name="uq_energy_project_year"),
    )


class Audit(Base):
    """Une ligne = les données d'audit d'un projet (unique par projet)."""
    __tablename__ = "audits"

    id = Column(String, primary_key=True)
    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    energies = Column(JSONB, nullable=True)           # sections (operational, buildings, …)
    influence_factors = Column(JSONB, nullable=True)  # facteurs d'influence
    invoices = Column(JSONB, nullable=True)            # factures / compteur
    field_sources = Column(JSONB, nullable=True)      # { "invoice_meter.field": { source, doc_name, doc_id } }


class ProjectDocument(Base):
    """Fichiers uploadés par projet (stockés en bytea pour Render)."""
    __tablename__ = "project_documents"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)       # mimetype
    doc_type = Column(String, nullable=False, default="autre")
    file_data = Column(LargeBinary, nullable=False)  # bytea
    file_hash = Column(String, nullable=True)        # SHA-256 hex digest
    status = Column(String, nullable=False, default="pending")
    extracted_data = Column(JSONB, nullable=True)
    created_at = Column(String, nullable=False)


class Report(Base):
    """Une ligne = le rapport d'un projet (unique par projet)."""
    __tablename__ = "reports"

    id = Column(String, primary_key=True)
    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    audit_type = Column(String, nullable=True)
    theme = Column(String, nullable=True)
    provider_name = Column(String, nullable=True)
    auditor_name = Column(String, nullable=True)
    competences = Column(String, nullable=True)
    field_sources = Column(JSONB, nullable=True)  # { field: { source, doc_name, doc_id } }


class ImprovementAction(Base):
    """Une action du plan d'amélioration énergétique (PA)."""
    __tablename__ = "improvement_actions"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reference = Column(String, nullable=True)            # ex: AA1, AA2
    intitule = Column(String, nullable=False)
    type_amelioration = Column(String, nullable=True)    # SER_PV, ELECTRIFICATION, …
    classification = Column(String, nullable=True)       # A ou B
    conditions_prealables = Column(String, nullable=True)
    investissement = Column(Float, nullable=True)
    economie_energie = Column(Float, nullable=True)      # MWh/an
    economie_co2 = Column(Float, nullable=True)          # kg/an
    duree_amortissement = Column(Integer, nullable=True) # années
    irr_avant_impot = Column(Float, nullable=True)
    pbt_avant_impot = Column(Float, nullable=True)
    irr_apres_impot = Column(Float, nullable=True)
    pbt_apres_impot = Column(Float, nullable=True)
    entreprise_ets = Column(Boolean, nullable=True)
    deduction_fiscale = Column(Boolean, nullable=True)
    description = Column(String, nullable=True)
    situation_existante = Column(String, nullable=True)
    created_at = Column(String, nullable=False)


class PlanAmeliorationHistory(Base):
    """Un event du plan d'amélioration : pré-remplissage IA ou upload manuel."""
    __tablename__ = "plan_amelioration_history"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String, nullable=False)  # "AI_PREFILL" | "MANUAL_UPLOAD"
    changes = Column(JSONB, nullable=True)         # { items:[...] } ou { excel_summary:{...} }
    created_at = Column(String, nullable=False)


class AmeliorationAction(Base):
    """
    Flexible JSONB store for AMUREBA Excel import results.
    One row = one AA sheet (AA1…AA9) extracted from an uploaded workbook.
    action_data holds the full AmurebaMappingService.map_sheet() output.
    """
    __tablename__ = "amelioration_actions"

    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    sheet_name = Column(String, nullable=False)        # e.g. "AA1", "AA3"
    action_data = Column(JSONB, nullable=True)         # full mapped result (flexible)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)


class LcaMaterial(Base):
    """Bibliothèque de matériaux ACV (partagée, indépendante des projets)."""
    __tablename__ = "lca_materials"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)       # mur/toiture/plancher/fenetre/fondation/autre
    functional_unit = Column(String, nullable=False) # ex: "m² de mur"
    unit = Column(String, nullable=False)            # ex: "m²"
    impacts = Column(JSONB, nullable=False)          # 22 valeurs EF v3.0 par unité fonctionnelle
    prix = Column(Float, nullable=True)              # prix moyen €/unité
    valeur_r = Column(Float, nullable=True)          # résistance thermique m²K/W
    is_fixed = Column(Boolean, nullable=False, default=False)  # non substituable en optimisation
    flux_reference = Column(Float, nullable=True)    # kg/(m²·K/W) — pour isolants: quantité = R × flux_ref × surface


class LcaProject(Base):
    """Éléments de construction ACV d'un projet (unique par projet)."""
    __tablename__ = "lca_projects"

    id = Column(String, primary_key=True)
    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    elements  = Column(JSONB, nullable=False, default=list)  # liste d'éléments du bâtiment (legacy)
    parois    = Column(JSONB, nullable=False, default=list)  # liste des parois avec leurs couches (legacy)
    batiment  = Column(JSONB, nullable=False, default=dict)  # paramètres bâtiment unique (legacy)
    batiments = Column(JSONB, nullable=False, default=list)  # tableau multi-bâtiments avec parois et composants
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
