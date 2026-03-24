"""add field_sources to audits, energy_accounting, reports

Revision ID: 005_add_field_sources
Revises: 004_add_project_documents
Create Date: 2026-03-23 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "005_add_field_sources"
down_revision: Union[str, None] = "004_add_project_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("audits", sa.Column("field_sources", JSONB(), nullable=True))
    op.add_column("energy_accounting", sa.Column("field_sources", JSONB(), nullable=True))
    op.add_column("reports", sa.Column("field_sources", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("audits", "field_sources")
    op.drop_column("energy_accounting", "field_sources")
    op.drop_column("reports", "field_sources")
