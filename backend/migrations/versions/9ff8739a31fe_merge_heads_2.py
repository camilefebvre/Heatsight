"""merge_heads_2

Revision ID: 9ff8739a31fe
Revises: 007_add_lca_building_fields, 31b74d2fd225
Create Date: 2026-04-09 10:19:14.623489

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ff8739a31fe'
down_revision: Union[str, None] = ('007_add_lca_building_fields', '31b74d2fd225')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
