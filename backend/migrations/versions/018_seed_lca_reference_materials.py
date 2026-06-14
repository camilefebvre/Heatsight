"""seed lca reference materials (bibliothèque officielle ACV)

Revision ID: 018_seed_lca_reference_materials
Revises: 017_add_calendar_and_event_owner
Create Date: 2026-06-14

Seed idempotent des 18 fiches de référence ACV (is_reference=true), keyé sur l'id
(UUID stable) via ON CONFLICT (id) DO NOTHING. Même source que le startup-hook
(app.lca_reference_data). Postgres only (cast jsonb).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "018_seed_lca_reference_materials"
down_revision: Union[str, None] = "017_add_calendar_and_event_owner"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from app.lca_reference_data import seed_lca_reference_materials
    seed_lca_reference_materials(op.get_bind())


def downgrade() -> None:
    from app.lca_reference_data import LCA_REFERENCE_MATERIALS
    ids = [m["id"] for m in LCA_REFERENCE_MATERIALS]
    op.execute(
        sa.text("DELETE FROM lca_materials WHERE id IN :ids")
        .bindparams(sa.bindparam("ids", value=ids, expanding=True))
    )
