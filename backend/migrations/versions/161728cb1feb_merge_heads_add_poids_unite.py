"""merge heads add poids unite

Revision ID: 161728cb1feb
Revises: 013_add_poids_unite, 8cf221fa73b7
Create Date: 2026-05-26 16:56:17.290465

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '161728cb1feb'
down_revision: Union[str, None] = ('013_add_poids_unite', '8cf221fa73b7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
