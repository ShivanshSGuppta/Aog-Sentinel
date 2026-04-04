"""initial control plane schema

Revision ID: 20260312_0001
Revises:
Create Date: 2026-03-12 19:02:00
"""

from __future__ import annotations

from alembic import op

from app.db.base import Base
from app.db import models  # noqa: F401


revision = "20260312_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
