"""add optimisation_hash and optimisation_cache columns to lca_projects

Revision ID: 010_add_lca_optimisation_cache
Revises: 009_add_lca_batiments
Create Date: 2026-04-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "010_add_lca_optimisation_cache"
down_revision: Union[str, None] = "009_add_lca_batiments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lca_projects",
        sa.Column("optimisation_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "lca_projects",
        sa.Column(
            "optimisation_cache",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("lca_projects", "optimisation_cache")
    op.drop_column("lca_projects", "optimisation_hash")
