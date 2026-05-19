"""add dvr_materiau to lca_materials and dvr_batiment/age_batiment to lca_projects

Revision ID: 011_add_lca_v2_fields
Revises: 010_add_lca_optimisation_cache
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "011_add_lca_v2_fields"
down_revision: Union[str, None] = "010_add_lca_optimisation_cache"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lca_materials",
        sa.Column("dvr_materiau", sa.Integer(), nullable=True),
    )
    op.add_column(
        "lca_projects",
        sa.Column("dvr_batiment", sa.Integer(), nullable=True, server_default="60"),
    )
    op.add_column(
        "lca_projects",
        sa.Column("age_batiment", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lca_projects", "age_batiment")
    op.drop_column("lca_projects", "dvr_batiment")
    op.drop_column("lca_materials", "dvr_materiau")
