"""mood and memory book (Round 2 batch 4)

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-18 17:53:40.559948

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('memory_entries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('story', sa.String(length=2000), nullable=False),
    sa.Column('photo_paths', sa.JSON(), nullable=False),
    sa.Column('voice_path', sa.String(length=80), nullable=True),
    sa.Column('voice_type', sa.String(length=40), nullable=True),
    sa.Column('voice_ms', sa.Integer(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['patient_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('memory_entries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_memory_entries_patient_id'), ['patient_id'], unique=False)

    op.create_table('mood_checkins',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('mood', sa.Enum('good', 'okay', 'not_so_good', name='mood', native_enum=False, length=16), nullable=True),
    sa.Column('answered_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['patient_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('patient_id', 'date')
    )
    with op.batch_alter_table('mood_checkins', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_mood_checkins_patient_id'), ['patient_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('mood_checkins', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_mood_checkins_patient_id'))

    op.drop_table('mood_checkins')
    with op.batch_alter_table('memory_entries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_memory_entries_patient_id'))

    op.drop_table('memory_entries')
