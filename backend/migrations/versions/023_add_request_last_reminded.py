"""add client_requests.last_reminded_at

Revision ID: 023_req_last_reminded
Revises: 022_proj_archive_emails
Create Date: 2026-07-15

- client_requests.last_reminded_at : ISO datetime du dernier rappel envoyé, nullable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "023_req_last_reminded"
down_revision: Union[str, None] = "022_proj_archive_emails"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_requests", sa.Column("last_reminded_at", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("client_requests", "last_reminded_at")
