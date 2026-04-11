"""add lca tables

Revision ID: 005_add_lca_tables
Revises: 004_add_project_documents
Create Date: 2026-03-18 00:00:00.000000

"""
from typing import Sequence, Union
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "005_add_lca_tables"
down_revision: Union[str, None] = "004_add_project_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MUR_EN_BRIQUE_IMPACTS = {
    "gwp100": 44.75,
    "acidification": 0.115,
    "ecotoxicity_fw": 376.3,
    "energy_nonrenewable": 400.38,
    "eutrophication_fw": 0.00533,
    "eutrophication_marine": 0.03182,
    "eutrophication_terrestrial": 0.352,
    "human_tox_carc": 0.0,
    "human_tox_noncarc": 0.0,
    "ionising_radiation": 1.898,
    "land_use": 233.93,
    "material_resources": 0.000137,
    "ozone_depletion": 0.000001,
    "particulate_matter": 0.0,
    "photochemical_oxidant": 0.131,
    "water_use": 5.608,
    "climate_biogenic": 0.169,
    "climate_fossil": 44.57,
    "climate_landuse": 0.01355,
}


def upgrade() -> None:
    op.create_table(
        "lca_materials",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("functional_unit", sa.String(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("impacts", JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "lca_projects",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("elements", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"],
            ondelete="CASCADE",
            name="fk_lca_project",
        ),
        sa.UniqueConstraint("project_id", name="uq_lca_project"),
    )
    op.create_index("ix_lca_projects_project_id", "lca_projects", ["project_id"])

    op.execute(
        text(
            "INSERT INTO lca_materials (id, name, category, functional_unit, unit, impacts) "
            "VALUES (:id, :name, :category, :functional_unit, :unit, cast(:impacts as jsonb))"
        ).bindparams(
            id="mat-mur-brique-001",
            name="Mur en brique",
            category="mur",
            functional_unit="m² de mur",
            unit="m²",
            impacts=json.dumps(_MUR_EN_BRIQUE_IMPACTS),
        )
    )


def downgrade() -> None:
    op.drop_index("ix_lca_projects_project_id", "lca_projects")
    op.drop_table("lca_projects")
    op.drop_table("lca_materials")
