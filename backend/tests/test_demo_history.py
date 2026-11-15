"""The demo history's in-memory alert replay must match the app's own alert check."""

from datetime import timedelta

import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import demo_history
from app.models import Alert, Role
from app.services import auth, decline
from app.services.clock import local, local_day_start, utc_now
from ml.decline.simulator import Profile


@pytest.mark.parametrize(("profile", "seed"), [("mci", 0), ("moderate", 2)])
def test_in_memory_replay_matches_database_replay(db: Session, profile: Profile, seed: int) -> None:
    patient = auth.register_user(db, name="P", email=f"{profile}@example.com", password="password123", role=Role.patient)
    demo_history.load_patient_history(db, patient, profile, seed)
    fast = [(a.created_at, a.severity, a.message) for a in db.scalars(select(Alert).order_by(Alert.created_at))]
    if profile == "moderate":
        assert fast, "the moderate demo patient is expected to raise alerts"

    # The slow way: the app's alert check, run against the database each evening.
    db.execute(delete(Alert))
    db.commit()
    today = local(utc_now()).date()
    for back in range(demo_history.DAYS, 0, -1):
        evening = local_day_start(today - timedelta(days=back)) + timedelta(hours=demo_history.ALERT_CHECK_HOUR)
        decline.evaluate_and_alert(db, patient, evening)
    slow = [(a.created_at, a.severity, a.message) for a in db.scalars(select(Alert).order_by(Alert.created_at))]
    assert fast == slow


def test_history_is_cached_per_day() -> None:
    first = local(utc_now()).date() - timedelta(days=demo_history.DAYS)
    assert demo_history.simulated_history("healthy", 1, first) is demo_history.simulated_history("healthy", 1, first)
