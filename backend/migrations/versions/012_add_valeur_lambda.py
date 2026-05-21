"""add valeur_lambda column to lca_materials

Revision ID: 012_add_valeur_lambda
Revises: 3f9061474938
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "012_add_valeur_lambda"
down_revision: Union[str, None] = "3f9061474938"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lca_materials', sa.Column('valeur_lambda', sa.Float(), nullable=True))

    op.execute("""
        UPDATE lca_materials
        SET valeur_lambda = (impacts->>'valeur_lambda')::float
        WHERE impacts ? 'valeur_lambda'
        AND impacts->>'valeur_lambda' IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('lca_materials', 'valeur_lambda')
