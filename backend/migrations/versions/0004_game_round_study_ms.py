"""game round study_ms

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-12 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: earlier rounds, and games without a study phase, have no viewing time.
    with op.batch_alter_table('game_rounds', schema=None) as batch_op:
        batch_op.add_column(sa.Column('study_ms', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('game_rounds', schema=None) as batch_op:
        batch_op.drop_column('study_ms')
