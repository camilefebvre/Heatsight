"""merge migration heads

Revision ID: 8cf221fa73b7
Revises: 007_add_amelioration_actions, 010_add_lca_optimisation_cache, c172a583fed3
Create Date: 2026-05-18 12:11:46.918848

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8cf221fa73b7'
down_revision: Union[str, None] = ('007_add_amelioration_actions', '010_add_lca_optimisation_cache', 'c172a583fed3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
