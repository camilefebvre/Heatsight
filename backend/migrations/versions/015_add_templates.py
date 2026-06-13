"""add templates library (audit/report) + active template FKs on projects

Revision ID: 015_add_templates
Revises: 014_add_is_reference
Create Date: 2026-06-13

- table templates (officiel protégé + customs par utilisateur, bytes BYTEA pour Render)
- projects.active_audit_template_id / active_report_template_id (FK, ON DELETE SET NULL)
- seed idempotent des 2 modèles officiels (file_bytes NULL → résolus depuis le disque/image)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015_add_templates"
down_revision: Union[str, None] = "014_add_is_reference"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "templates",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("file_bytes", sa.LargeBinary(), nullable=True),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("is_official", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("supports_prefill", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("scope", sa.String(), nullable=False, server_default="user"),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.add_column("projects", sa.Column(
        "active_audit_template_id", sa.String(),
        sa.ForeignKey("templates.id", ondelete="SET NULL"), nullable=True))
    op.add_column("projects", sa.Column(
        "active_report_template_id", sa.String(),
        sa.ForeignKey("templates.id", ondelete="SET NULL"), nullable=True))
    # Seed idempotent des modèles officiels (file_bytes NULL → résolus depuis le disque/image)
    op.execute("""
        INSERT INTO templates (id, type, name, file_bytes, original_filename,
                               is_official, supports_prefill, owner_id, scope, created_at)
        VALUES
          ('official-audit',  'audit',  'Modèle officiel AMUREBA',    NULL, NULL, true, true, NULL, 'official', '2026-01-01T00:00:00+00:00'),
          ('official-report', 'report', 'Modèle officiel de rapport', NULL, NULL, true, true, NULL, 'official', '2026-01-01T00:00:00+00:00')
        ON CONFLICT (id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_column("projects", "active_report_template_id")
    op.drop_column("projects", "active_audit_template_id")
    op.drop_table("templates")
