"""add project archive flag + additional client emails

Revision ID: 022_add_project_archive_and_emails
Revises: 021_add_subscription_fields
Create Date: 2026-07-15

- projects.archived      : booléen d'archivage (défaut false), non nullable.
- projects.client_emails : emails additionnels du client (JSONB liste), nullable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "022_proj_archive_emails"
down_revision: Union[str, None] = "021_add_subscription_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "projects",
        sa.Column("client_emails", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "client_emails")
    op.drop_column("projects", "archived")
