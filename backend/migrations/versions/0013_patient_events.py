"""patient events: settings changes for the caregiver timeline (Round 2 batch 2)

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-18 16:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'patient_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('kind', sa.String(length=24), nullable=False),
        sa.Column('summary', sa.String(length=300), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['patient_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('patient_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_patient_events_at'), ['at'], unique=False)
        batch_op.create_index(batch_op.f('ix_patient_events_patient_id'), ['patient_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('patient_events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_patient_events_patient_id'))
        batch_op.drop_index(batch_op.f('ix_patient_events_at'))
    op.drop_table('patient_events')
