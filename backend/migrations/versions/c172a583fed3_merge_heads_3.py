"""merge_heads_3

Revision ID: c172a583fed3
Revises: 008_add_flux_reference
Create Date: 2026-04-09 15:20:13.915895

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c172a583fed3'
down_revision: Union[str, None] = ('9ff8739a31fe', '008_add_flux_reference')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
