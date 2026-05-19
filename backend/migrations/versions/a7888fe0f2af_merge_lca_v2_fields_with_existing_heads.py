"""merge lca v2 fields with existing heads

Revision ID: a7888fe0f2af
Revises: 011_add_lca_v2_fields, c172a583fed3
Create Date: 2026-05-17 09:06:01.920717

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7888fe0f2af'
down_revision: Union[str, None] = ('011_add_lca_v2_fields', 'c172a583fed3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
