"""add flux_reference to lca_materials

Revision ID: 008_add_flux_reference
Revises: 007_add_lca_building_fields
Create Date: 2026-04-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008_add_flux_reference"
down_revision: Union[str, None] = "007_add_lca_building_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lca_materials",
        sa.Column("flux_reference", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lca_materials", "flux_reference")
