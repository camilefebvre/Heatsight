"""drop lca v1 legacy columns (elements, parois, batiment) from lca_projects

Revision ID: 025_drop_lca_v1_legacy_columns
Revises: 024_add_user_is_admin
Create Date: 2026-07-15 00:00:00.000000

La v1 ACV est retirée : les colonnes legacy elements/parois/batiment ne sont
plus lues ni écrites (seul `batiments` est utilisé par la v2).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "025_drop_lca_v1_legacy_columns"
down_revision: Union[str, None] = "024_add_user_is_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("lca_projects", "elements")
    op.drop_column("lca_projects", "parois")
    op.drop_column("lca_projects", "batiment")


def downgrade() -> None:
    op.add_column(
        "lca_projects",
        sa.Column("batiment", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column(
        "lca_projects",
        sa.Column("parois", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "lca_projects",
        sa.Column("elements", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
