"""add poids_unite column to lca_materials

Revision ID: 013_add_poids_unite
Revises: 012_add_valeur_lambda
Create Date: 2026-05-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "013_add_poids_unite"
down_revision: Union[str, None] = "012_add_valeur_lambda"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lca_materials', sa.Column('poids_unite', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('lca_materials', 'poids_unite')
