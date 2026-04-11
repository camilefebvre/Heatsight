"""add lca material fields

Revision ID: 006_add_lca_material_fields
Revises: 005_add_lca_tables
Create Date: 2026-04-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006_add_lca_material_fields"
down_revision: Union[str, None] = "005_add_lca_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lca_materials", sa.Column("prix", sa.Float(), nullable=True))
    op.add_column("lca_materials", sa.Column("valeur_r", sa.Float(), nullable=True))
    op.add_column(
        "lca_materials",
        sa.Column("is_fixed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("lca_materials", "is_fixed")
    op.drop_column("lca_materials", "valeur_r")
    op.drop_column("lca_materials", "prix")
