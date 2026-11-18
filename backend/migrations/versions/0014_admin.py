"""admin: system state, feedback, admin log, research consent

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-18 16:46:22.508777

Round 2 batch 3. The research consent is a new ConsentKind value ("research"), stored in the
existing consents table (a plain string column), so it needs no schema change; downgrading
removes those records, which older code would not understand.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('system_state',
    sa.Column('key', sa.String(length=40), nullable=False),
    sa.Column('value', sa.String(length=200), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    op.create_table('admin_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('admin_id', sa.Integer(), nullable=True),
    sa.Column('admin_email', sa.String(length=254), nullable=False),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('action', sa.String(length=40), nullable=False),
    sa.Column('detail', sa.String(length=500), nullable=False),
    sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('admin_log', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_admin_log_action'), ['action'], unique=False)
        batch_op.create_index(batch_op.f('ix_admin_log_at'), ['at'], unique=False)

    op.create_table('feedback',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('role', sa.Enum('patient', 'caregiver', name='role', native_enum=False, length=16), nullable=False),
    sa.Column('kind', sa.Enum('hard', 'liked', 'other', name='feedbackkind', native_enum=False, length=16), nullable=False),
    sa.Column('text', sa.String(length=2000), nullable=True),
    sa.Column('page', sa.String(length=200), nullable=True),
    sa.Column('audio_key', sa.String(length=200), nullable=True),
    sa.Column('audio_type', sa.String(length=40), nullable=True),
    sa.Column('status', sa.Enum('new', 'read', 'resolved', name='feedbackstatus', native_enum=False, length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_feedback_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_feedback_user_id'), ['user_id'], unique=False)



def downgrade() -> None:
    op.execute("DELETE FROM consents WHERE kind = 'research'")
    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_feedback_user_id'))
        batch_op.drop_index(batch_op.f('ix_feedback_created_at'))

    op.drop_table('feedback')
    with op.batch_alter_table('admin_log', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_admin_log_at'))
        batch_op.drop_index(batch_op.f('ix_admin_log_action'))

    op.drop_table('admin_log')
    op.drop_table('system_state')
