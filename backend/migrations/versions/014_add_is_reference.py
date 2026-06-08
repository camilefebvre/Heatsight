"""add is_reference flag to lca_materials

Revision ID: 014_add_is_reference
Revises: 161728cb1feb
Create Date: 2026-06-08

Ajoute un drapeau booléen is_reference sur lca_materials.
- DEFAULT false : toute fiche importée APRÈS cette migration est éditable/supprimable.
- Option A : toutes les fiches déjà présentes au moment de la migration sont
  marquées comme références (non modifiables / non supprimables via l'API).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "014_add_is_reference"
down_revision: Union[str, None] = "161728cb1feb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lca_materials",
        sa.Column(
            "is_reference",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Option A : marque toutes les fiches déjà en base comme références.
    op.execute("UPDATE lca_materials SET is_reference = true")


def downgrade() -> None:
    op.drop_column("lca_materials", "is_reference")
