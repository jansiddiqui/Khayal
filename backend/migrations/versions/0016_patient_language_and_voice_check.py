"""patient language and voice check (Round 2 batch 5)

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-18 19:53:22.684343

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0016'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('language', sa.String(length=5), server_default='en', nullable=False))
        batch_op.add_column(sa.Column('voice_check', sa.JSON(), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('voice_check')
        batch_op.drop_column('language')

