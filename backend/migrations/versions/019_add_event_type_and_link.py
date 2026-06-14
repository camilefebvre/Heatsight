"""add events.type + events.link (type d'événement + lien optionnel visio)

Revision ID: 019_add_event_type_and_link
Revises: 018_seed_lca_reference_materials
Create Date: 2026-06-14

- events.type : type d'événement persisté (rdv/visite/call/deadline/autre).
- events.link : lien optionnel (ex. visio), affiché conditionnellement côté front.
Les deux nullable (anciens events sans valeur → fallback front via detectType).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "019_add_event_type_and_link"
down_revision: Union[str, None] = "018_seed_lca_reference_materials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("type", sa.String(), nullable=True))
    op.add_column("events", sa.Column("link", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "link")
    op.drop_column("events", "type")
