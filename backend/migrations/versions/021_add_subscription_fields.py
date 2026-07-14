"""add subscription fields (plan, status, trial_ends_at, current_period_end)

Revision ID: 021_add_subscription_fields
Revises: 020_add_user_profile_fields
Create Date: 2026-07-14

- users.plan                : none/trial/annual/triennial, nullable.
- users.subscription_status : trialing/pending/active/expired, nullable.
- users.trial_ends_at       : ISO datetime (fin de la période d'essai), nullable.
- users.current_period_end  : ISO datetime (fin de période payée), nullable.
Les quatre nullable (comptes existants → NULL, fallback front "aucun abonnement").
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "021_add_subscription_fields"
down_revision: Union[str, None] = "020_add_user_profile_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("plan", sa.String(), nullable=True))
    op.add_column("users", sa.Column("subscription_status", sa.String(), nullable=True))
    op.add_column("users", sa.Column("trial_ends_at", sa.String(), nullable=True))
    op.add_column("users", sa.Column("current_period_end", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "current_period_end")
    op.drop_column("users", "trial_ends_at")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "plan")
