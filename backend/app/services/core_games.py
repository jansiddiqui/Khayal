"""Each patient's core set: the 4 levelled games tracked for decline (CLAUDE.md section 7, D7).

Only core games rotate through slots 2-3 of "Today's games" and count towards decline alerts and
the overall index. Every other levelled game is a "More games" game: playable any time, recorded
with its own warm-up and baseline, but not in the rotation or the alerts. About Today is always
tracked (it is slot 1 every day).
"""

from collections.abc import Iterable

from app.models import LEVELLED_GAMES, GameType, User

CORE_SIZE = 4

# The 4 levelled games from before games v2; patients who had already played keep them
# (migration 0012), so their baselines keep counting.
LEGACY_CORE: tuple[GameType, ...] = (
    GameType.memory_match,
    GameType.sequence_recall,
    GameType.word_recall,
    GameType.reaction_tap,
)

# New patients: one game per domain (docs/games/research.md D7): verbal memory, visuospatial
# memory, executive/speed, everyday function.
DEFAULT_CORE: tuple[GameType, ...] = (
    GameType.word_recall,
    GameType.object_location,
    GameType.colour_trails,
    GameType.money_handling,
)

# The domain each levelled game mainly tests, shown to caregivers when they change the set.
Domain = str
DOMAINS: dict[GameType, Domain] = {
    GameType.word_recall: "Verbal memory",
    GameType.memory_match: "Visuospatial memory",
    GameType.sequence_recall: "Working memory: order",
    GameType.reaction_tap: "Speed and attention",
    GameType.object_location: "Visuospatial memory: where things are",
    GameType.spatial_span: "Visuospatial working memory",
    GameType.money_handling: "Everyday function: money",
    GameType.clock_setting: "Visuospatial and time",
    GameType.colour_trails: "Attention and task switching",
}

ALWAYS_TRACKED: frozenset[GameType] = frozenset({GameType.daily_orientation})


def core_games(patient: User) -> list[GameType]:
    stored = [GameType(g) for g in patient.core_games or [] if g in GameType._value2member_map_]
    valid = [g for g in stored if g in LEVELLED_GAMES]
    return valid if len(valid) == CORE_SIZE else list(DEFAULT_CORE)


def tracked_games(patient: User) -> frozenset[GameType]:
    """The games whose decline counts for alerts and the overall index. Delayed word recall
    counts when Remember the Words is in the core set (it follows those sessions)."""
    core = frozenset(core_games(patient))
    delayed = {GameType.word_recall_delayed} if GameType.word_recall in core else set()
    return core | ALWAYS_TRACKED | delayed


def valid_core(games: Iterable[GameType]) -> bool:
    chosen = list(games)
    return len(chosen) == CORE_SIZE and len(set(chosen)) == CORE_SIZE and set(chosen) <= set(LEVELLED_GAMES)
