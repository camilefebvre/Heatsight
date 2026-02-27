"""create projects table

Revision ID: 001_create_projects
Revises:
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_create_projects"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_name", sa.String(), nullable=False),
        sa.Column("client_name", sa.String(), nullable=False),
        sa.Column("client_email", sa.String(), nullable=False),
        sa.Column("client_phone", sa.String(), nullable=True),
        sa.Column("building_address", sa.String(), nullable=False),
        sa.Column("building_type", sa.String(), nullable=False),
        sa.Column("audit_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("excel_file", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column(
            "audit_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "energy_accounting",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "report_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("projects")
