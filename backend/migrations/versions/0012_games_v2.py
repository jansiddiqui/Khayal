"""games v2: round errors, tutorial state, core set and festivals per patient

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-18 01:15:00

Patients who have already played get their current 4 levelled games as their core set, so
their baselines keep counting (docs/games/research.md D7). Everyone else gets the default core
set (core_games = NULL, see app/services/core_games.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The 4 levelled games before games v2 (kept here so the migration never changes with the code).
LEGACY_CORE = ["memory_match", "sequence_recall", "word_recall", "reaction_tap"]


def upgrade() -> None:
    with op.batch_alter_table('game_rounds', schema=None) as batch_op:
        batch_op.add_column(sa.Column('errors', sa.Integer(), nullable=True))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('core_games', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('festivals', sa.JSON(), nullable=True))

    op.create_table(
        'tutorial_states',
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('game_type', sa.Enum(
            'memory_match', 'sequence_recall', 'word_recall', 'daily_orientation', 'reaction_tap',
            'object_location', 'colour_trails', 'clock_setting', 'money_handling', 'spatial_span',
            'word_recall_delayed', name='gametype', native_enum=False, length=32,
        ), nullable=False),
        sa.Column('seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('patient_id', 'game_type'),
    )

    # Existing players keep the games their baselines are built on.
    users = sa.table('users', sa.column('id', sa.Integer()), sa.column('core_games', sa.JSON()))
    sessions = sa.table('game_sessions', sa.column('patient_id', sa.Integer()))
    played = sa.select(sessions.c.patient_id).distinct()
    op.execute(users.update().where(users.c.id.in_(played)).values(core_games=LEGACY_CORE))


def downgrade() -> None:
    # Sessions of the new games can't be read by the old code: remove them (rounds cascade).
    new_games = (
        'object_location', 'colour_trails', 'clock_setting', 'money_handling', 'spatial_span', 'word_recall_delayed',
    )
    names = ", ".join(f"'{g}'" for g in new_games)
    op.execute(f"DELETE FROM game_rounds WHERE session_id IN (SELECT id FROM game_sessions WHERE game_type IN ({names}))")
    op.execute(f"DELETE FROM game_sessions WHERE game_type IN ({names})")
    op.execute(f"DELETE FROM player_levels WHERE game_type IN ({names})")
    op.execute(f"DELETE FROM tutorial_states WHERE game_type IN ({names})")
    # Pins may name a new game; the old code would fail on it, so pins return to automatic.
    op.execute("UPDATE users SET pinned_games = NULL")

    op.drop_table('tutorial_states')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('festivals')
        batch_op.drop_column('core_games')
    with op.batch_alter_table('game_rounds', schema=None) as batch_op:
        batch_op.drop_column('errors')
