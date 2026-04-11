"""merge_heads

Revision ID: 31b74d2fd225
Revises: 005_add_field_sources, 006_add_lca_material_fields
Create Date: 2026-04-08 18:01:10.087169

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '31b74d2fd225'
down_revision: Union[str, None] = ('005_add_field_sources', '006_add_lca_material_fields')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
