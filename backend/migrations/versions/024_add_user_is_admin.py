"""add users.is_admin

Revision ID: 024_add_user_is_admin
Revises: 023_req_last_reminded
Create Date: 2026-07-15

- users.is_admin : accès au back-office admin (défaut false), non nullable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "024_add_user_is_admin"
down_revision: Union[str, None] = "023_req_last_reminded"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "is_admin")
