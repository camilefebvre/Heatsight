"""add amelioration_actions table (JSONB flexible store)

Revision ID: 007_add_amelioration_actions
Revises: 006_add_improvement_actions
Create Date: 2026-04-07 00:00:00.000000

Table purpose
-------------
Stores the raw + mapped output from an AMUREBA Excel import.
One row per sheet (e.g. AA1, AA3) per project.
`action_data` is a free-form JSONB column that holds the full
AmurebaMappingService result so the schema can evolve without migrations.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "007_add_amelioration_actions"
down_revision: Union[str, None] = "006_add_improvement_actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "amelioration_actions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "project_id",
            sa.String(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sheet_name", sa.String(), nullable=False),
        sa.Column("action_data", JSONB(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_amelioration_actions_project_id",
        "amelioration_actions",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_amelioration_actions_project_id", table_name="amelioration_actions")
    op.drop_table("amelioration_actions")
