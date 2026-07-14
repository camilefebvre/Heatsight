"""add user profile fields (avatar, company_name, company_logo)

Revision ID: 020_add_user_profile_fields
Revises: 019_add_event_type_and_link
Create Date: 2026-07-14

- users.avatar        : photo de profil (data URL base64), nullable.
- users.company_name  : nom du cabinet / entreprise, nullable.
- users.company_logo  : logo entreprise (data URL base64), nullable.
Les trois nullable (comptes existants → valeurs NULL, fallback front via initiales).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "020_add_user_profile_fields"
down_revision: Union[str, None] = "019_add_event_type_and_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar", sa.String(), nullable=True))
    op.add_column("users", sa.Column("company_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("company_logo", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "company_logo")
    op.drop_column("users", "company_name")
    op.drop_column("users", "avatar")
