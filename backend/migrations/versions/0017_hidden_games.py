"""hidden games and the More games rotation state (more-games-rotation)

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-18 21:48:07.788318

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0017'
down_revision: Union[str, None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('hidden_games', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('more_games_state', sa.JSON(), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('more_games_state')
        batch_op.drop_column('hidden_games')

