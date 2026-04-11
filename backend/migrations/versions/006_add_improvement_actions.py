"""add improvement_actions table

Revision ID: 006_add_improvement_actions
Revises: 005_add_field_sources
Create Date: 2026-04-07 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "006_add_improvement_actions"
down_revision: Union[str, None] = "005_add_field_sources"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "improvement_actions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "project_id",
            sa.String(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reference", sa.String(), nullable=True),
        sa.Column("intitule", sa.String(), nullable=False),
        sa.Column("type_amelioration", sa.String(), nullable=True),
        sa.Column("classification", sa.String(), nullable=True),
        sa.Column("conditions_prealables", sa.Text(), nullable=True),
        sa.Column("investissement", sa.Float(), nullable=True),
        sa.Column("economie_energie", sa.Float(), nullable=True),
        sa.Column("economie_co2", sa.Float(), nullable=True),
        sa.Column("duree_amortissement", sa.Integer(), nullable=True),
        sa.Column("irr_avant_impot", sa.Float(), nullable=True),
        sa.Column("pbt_avant_impot", sa.Float(), nullable=True),
        sa.Column("irr_apres_impot", sa.Float(), nullable=True),
        sa.Column("pbt_apres_impot", sa.Float(), nullable=True),
        sa.Column("entreprise_ets", sa.Boolean(), nullable=True),
        sa.Column("deduction_fiscale", sa.Boolean(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("situation_existante", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("improvement_actions")
