"""add events.owner_id + users.calendar_token (agenda par user + abonnement .ics)

Revision ID: 017_add_calendar_and_event_owner
Revises: 016_add_project_updated_at
Create Date: 2026-06-14

- events.owner_id (FK users, ON DELETE CASCADE) + backfill via le projet de l'event
  (les events sans projet restent NULL = cachés).
- users.calendar_token (secret URL .ics, génération paresseuse).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "017_add_calendar_and_event_owner"
down_revision: Union[str, None] = "016_add_project_updated_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column(
        "owner_id", sa.String(),
        sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    op.execute(
        "UPDATE events SET owner_id = p.owner_id FROM projects p "
        "WHERE events.project_id = p.id AND events.owner_id IS NULL"
    )
    op.add_column("users", sa.Column("calendar_token", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "calendar_token")
    op.drop_column("events", "owner_id")
