from sqlalchemy import Column, String, Float, Integer, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB

from .database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True)
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
    details = Column(JSONB, nullable=True)   # breakdown by section (operational, buildings, …)

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
