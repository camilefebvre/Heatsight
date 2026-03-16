"""add project_documents table

Revision ID: 004_add_project_documents
Revises: 003_add_users_owner
Create Date: 2026-03-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "004_add_project_documents"
down_revision: Union[str, None] = "003_add_users_owner"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("original_name", sa.String(), nullable=False),
        sa.Column("file_type", sa.String(), nullable=False),
        sa.Column("doc_type", sa.String(), nullable=False, server_default="autre"),
        sa.Column("file_data", sa.LargeBinary(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("extracted_data", JSONB(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE", name="fk_projdoc_project"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_projdoc_owner"
        ),
    )
    op.create_index("ix_projdoc_project_id", "project_documents", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_projdoc_project_id", "project_documents")
    op.drop_table("project_documents")
