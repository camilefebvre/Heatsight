"""add updated_at on projects (derniere activite)

Revision ID: 016_add_project_updated_at
Revises: 015_add_templates
Create Date: 2026-06-14

Colonne projects.updated_at (ISO string), touchée à chaque activité du projet
via _touch_project. Backfill : updated_at = created_at pour les lignes existantes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "016_add_project_updated_at"
down_revision: Union[str, None] = "015_add_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("updated_at", sa.String(), nullable=True))
    op.execute("UPDATE projects SET updated_at = created_at WHERE updated_at IS NULL")


def downgrade() -> None:
    op.drop_column("projects", "updated_at")
