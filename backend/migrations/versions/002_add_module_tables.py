"""add module tables (events, client_requests, energy_accounting, audits, reports)

Revision ID: 002_add_module_tables
Revises: 001_create_projects
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002_add_module_tables"
down_revision: Union[str, None] = "001_create_projects"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── events ──────────────────────────────────────────────────────────────
    op.create_table(
        "events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("start", sa.String(), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── client_requests ──────────────────────────────────────────────────────
    op.create_table(
        "client_requests",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("client_email", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("sent_at", sa.String(), nullable=True),
        sa.Column(
            "documents",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("feedback", sa.String(), nullable=True),
        sa.Column(
            "received_files",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── energy_accounting ────────────────────────────────────────────────────
    op.create_table(
        "energy_accounting",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("year", sa.String(), nullable=False),
        sa.Column("electricity", sa.Float(), nullable=True),
        sa.Column("gas", sa.Float(), nullable=True),
        sa.Column("fuel", sa.Float(), nullable=True),
        sa.Column("biogas", sa.Float(), nullable=True),
        sa.Column("utility1", sa.Float(), nullable=True),
        sa.Column("utility2", sa.Float(), nullable=True),
        sa.Column("process", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "year", name="uq_energy_project_year"),
    )

    # ── audits ───────────────────────────────────────────────────────────────
    op.create_table(
        "audits",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column(
            "energies",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "influence_factors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "invoices",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", name="uq_audit_project"),
    )

    # ── reports ──────────────────────────────────────────────────────────────
    op.create_table(
        "reports",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("audit_type", sa.String(), nullable=True),
        sa.Column("theme", sa.String(), nullable=True),
        sa.Column("provider_name", sa.String(), nullable=True),
        sa.Column("auditor_name", sa.String(), nullable=True),
        sa.Column("competences", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", name="uq_report_project"),
    )

    # ── Suppression des colonnes JSONB redondantes dans projects ─────────────
    op.drop_column("projects", "audit_data")
    op.drop_column("projects", "energy_accounting")
    op.drop_column("projects", "report_data")


def downgrade() -> None:
    # Ré-ajouter les colonnes JSONB dans projects
    op.add_column(
        "projects",
        sa.Column("report_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("energy_accounting", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("audit_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.drop_table("reports")
    op.drop_table("audits")
    op.drop_table("energy_accounting")
    op.drop_table("client_requests")
    op.drop_table("events")
