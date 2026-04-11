"""add lca building fields

Revision ID: 007_add_lca_building_fields
Revises: 006_add_lca_material_fields
Create Date: 2026-04-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "007_add_lca_building_fields"
down_revision: Union[str, None] = "006_add_lca_material_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lca_projects",
        sa.Column(
            "parois",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "lca_projects",
        sa.Column(
            "batiment",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("lca_projects", "batiment")
    op.drop_column("lca_projects", "parois")
