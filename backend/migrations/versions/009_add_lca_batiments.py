"""add batiments column to lca_projects

Revision ID: 009_add_lca_batiments
Revises: 008_add_flux_reference
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009_add_lca_batiments"
down_revision: Union[str, None] = "008_add_flux_reference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lca_projects",
        sa.Column(
            "batiments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("lca_projects", "batiments")
