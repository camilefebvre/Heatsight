"""merge remaining alembic heads

Revision ID: 3f9061474938
Revises: 007_add_amelioration_actions, a7888fe0f2af
Create Date: 2026-05-17 09:19:32.698980

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f9061474938'
down_revision: Union[str, None] = ('007_add_amelioration_actions', 'a7888fe0f2af')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
