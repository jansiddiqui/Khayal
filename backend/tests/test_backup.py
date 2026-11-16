"""Full backup (Admin → Download full backup) and `python -m app.restore_backup`.

The round trip runs on SQLite, and on Postgres when KHAYAL_TEST_MIGRATIONS_DATABASE_URL points at an
empty database (see conftest.py): migrate, fill with realistic data, back up, start again from an
empty database at the same revision, restore, and compare every row and every file."""

import hashlib
import io
import json
import logging
import zipfile
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

from app import config, restore_backup
from app.demo_history import load_demo_history
from app.models import (
    ConsentKind,
    DeviceSession,
    InviteRequest,
    InviteRole,
    Role,
    SignupInvite,
    User,
)
from app.seed import placeholder_photo, seed
from app.services import auth, backup, consent, elders, speech, storage, tokens
from tests.conftest import Register, bearer
from tests.test_migrations import POSTGRES_URL, alembic_config

NOW = datetime(2026, 11, 16, 9, 30, tzinfo=timezone.utc)
WEBM = b"\x1a\x45\xdf\xa3" + bytes(range(256)) * 8
ADMIN = "admin@khayal.test"


# --- a migrated database of each kind ---------------------------------------------------------


def _fresh(url: str) -> None:
    """Make the database empty and migrate it to head."""
    engine = create_engine(url)
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()
    if url.startswith("sqlite:///"):
        Path(url.removeprefix("sqlite:///")).unlink(missing_ok=True)
    command.upgrade(alembic_config(url), "head")


@pytest.fixture(params=["sqlite-disk", "sqlite-db", "postgres-db"])
def target(request: pytest.FixtureRequest, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[str, str]]:
    """(database url, storage backend)."""
    kind, backend = request.param.split("-")
    if kind == "sqlite":
        url = f"sqlite:///{(tmp_path / 'khayal.db').as_posix()}"
    else:
        if POSTGRES_URL is None:
            pytest.skip("KHAYAL_TEST_MIGRATIONS_DATABASE_URL is not set")
        url = config.normalize_database_url(POSTGRES_URL)
    monkeypatch.setattr(config, "STORAGE_BACKEND", backend)
    _fresh(url)
    yield url, backend


def _session(url: str) -> tuple[Engine, Session]:
    engine = create_engine(url)
    return engine, sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def _fill(db: Session) -> None:
    """Every kind of data the pilot holds: the demo family with photos and 90 days of history, an elder
    added the pilot way with consents, a photo and a recording, a paired device, invites and requests."""
    caregiver, patients = seed(db)
    load_demo_history(db, patients)
    elder = elders.add(db, caregiver, name="Lakshmi Rao", city="Mysuru", basis="family", photos=True, voice=True, now=NOW)
    elders.set_photo(db, elder, placeholder_photo((14, 94, 99)))
    speech.save_recording(db, elder, WEBM, "audio/webm", 42_000, NOW)
    db.add(DeviceSession(patient_id=elder.id, paired_by=caregiver.id, device_label="Android phone · Chrome", created_at=NOW, last_seen_at=NOW))
    request = InviteRequest(name="Anita Rao", email="anita@example.com", role=InviteRole.family, city="Pune", message="For my father", consent_at=NOW)
    db.add(request)
    db.flush()
    db.add(SignupInvite(token_hash=tokens.hash_token("abc"), note="Anita", invite_request_id=request.id, created_by=caregiver.id, expires_at=NOW))
    consent.record(db, caregiver, ConsentKind.processing, NOW)
    db.commit()


def _snapshot(db: Session) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str]]:
    """Every row of every data table (as the backup encodes it) and every file's SHA-256."""
    connection = db.connection()
    rows = {}
    for table in backup.data_tables(backup.reflect(connection)):
        result = connection.execute(select(table).order_by(*backup._order_by(table)))
        rows[table.name] = [{k: backup._encode(v) for k, v in row._mapping.items()} for row in result]
    store = storage.get()
    files = {}
    for entry in backup._file_entries(db):
        data = store.load(db, entry.key)
        assert data is not None
        files[entry.key] = hashlib.sha256(data).hexdigest()
    return rows, files


def _backup(db: Session) -> bytes:
    out = io.BytesIO()
    backup.write(db, out, NOW, made_by=ADMIN)
    return out.getvalue()


# --- round trip -------------------------------------------------------------------------------


def test_round_trip_restores_identical_rows_and_files(
    target: tuple[str, str], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url, backend = target
    engine, db = _session(url)
    _fill(db)
    before_rows, before_files = _snapshot(db)
    data = _backup(db)
    db.close()
    engine.dispose()
    assert sum(len(r) for r in before_rows.values()) > 500 and len(before_files) >= 4

    # Disaster: a new, empty database at the same revision (and an empty upload folder).
    _fresh(url)
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "restored-uploads")
    engine, db = _session(url)
    report = backup.restore(db, io.BytesIO(data))
    assert report.files == len(before_files)

    after_rows, after_files = _snapshot(db)
    assert {k: len(v) for k, v in after_rows.items()} == {k: len(v) for k, v in before_rows.items()}
    assert after_rows == before_rows
    assert after_files == before_files
    assert backup.verify(db, io.BytesIO(data)) == []

    # New rows still get fresh ids (Postgres sequences were moved past the restored ones).
    newcomer = auth.register_user(db, name="New Caregiver", email="new@example.com", password="a-long-password", role=Role.caregiver)
    assert newcomer.id > max(r["id"] for r in before_rows["users"])
    db.close()
    engine.dispose()
    del backend


def test_restore_refuses_a_database_that_is_not_empty(target: tuple[str, str]) -> None:
    url, _ = target
    engine, db = _session(url)
    _fill(db)
    data = _backup(db)
    with pytest.raises(backup.RestoreRefusedError, match="not empty"):
        backup.restore(db, io.BytesIO(data))
    db.rollback()
    assert db.scalar(select(User).where(User.email == "new@example.com")) is None
    db.close()
    engine.dispose()


def test_restore_refuses_another_migration_revision(target: tuple[str, str]) -> None:
    url, _ = target
    engine, db = _session(url)
    _fill(db)
    data = _backup(db)
    db.close()
    engine.dispose()
    _fresh(url)
    command.downgrade(alembic_config(url), "-1")
    engine, db = _session(url)
    with pytest.raises(backup.RestoreRefusedError, match="migration revision"):
        backup.restore(db, io.BytesIO(data))
    db.close()
    engine.dispose()


def _rewrite(data: bytes, change: dict[str, bytes | None]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, "w") as dst:
        for item in src.infolist():
            if item.filename in change:
                if change[item.filename] is not None:
                    dst.writestr(item.filename, change[item.filename])  # type: ignore[arg-type]
            else:
                dst.writestr(item, src.read(item.filename))
    return out.getvalue()


def test_restore_refuses_damaged_or_foreign_zips(target: tuple[str, str]) -> None:
    url, _ = target
    engine, db = _session(url)
    _fill(db)
    data = _backup(db)
    db.close()
    engine.dispose()
    _fresh(url)
    engine, db = _session(url)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        photo = next(n for n in z.namelist() if n.startswith("files/family/"))
    with pytest.raises(backup.BackupError, match="checksum"):
        backup.restore(db, io.BytesIO(_rewrite(data, {photo: b"not the photo"})))
    with pytest.raises(backup.BackupError, match="no manifest"):
        backup.restore(db, io.BytesIO(_rewrite(data, {"manifest.json": None})))
    export_like = io.BytesIO()
    with zipfile.ZipFile(export_like, "w") as z:
        z.writestr("manifest.json", json.dumps({"format": "something-else"}))
    with pytest.raises(backup.BackupError, match="not a Khayal full backup"):
        backup.restore(db, io.BytesIO(export_like.getvalue()))
    # Nothing was written by the refused attempts.
    assert db.scalar(select(User.id)) is None
    db.close()
    engine.dispose()


def test_command_line_restores_and_refuses_a_second_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    url = f"sqlite:///{(tmp_path / 'cli.db').as_posix()}"
    monkeypatch.setattr(config, "STORAGE_BACKEND", "db")
    _fresh(url)
    engine, db = _session(url)
    _fill(db)
    path = tmp_path / "khayal-backup.zip"
    path.write_bytes(_backup(db))
    db.close()
    engine.dispose()
    _fresh(url)
    engine = create_engine(url)
    monkeypatch.setattr(restore_backup, "SessionLocal", sessionmaker(bind=engine, autoflush=False, expire_on_commit=False))

    assert restore_backup.main([str(path)]) == 0
    assert "Row counts and file checksums match" in capsys.readouterr().out
    assert restore_backup.main([str(path)]) == 1
    assert "Refused: The target database is not empty" in capsys.readouterr().err
    assert restore_backup.main([str(tmp_path / "missing.zip")]) == 2
    engine.dispose()


# --- the admin route --------------------------------------------------------------------------


@pytest.fixture
def admin_headers(register: Register, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({ADMIN}))
    return bearer(register("Admin", ADMIN, "caregiver"))


def test_admin_downloads_a_full_backup_once_per_ten_minutes(
    client: TestClient, admin_headers: dict[str, str], db_session_factory: sessionmaker[Session],
    clock: Any, caplog: pytest.LogCaptureFixture,
) -> None:
    with db_session_factory() as db:
        seed(db)
    clock.now = NOW
    with caplog.at_level(logging.INFO, logger="khayal.backup"):
        response = client.get("/api/admin/backup", headers=admin_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"] == 'attachment; filename="khayal-backup-2026-11-16-0930.zip"'
    assert response.headers["cache-control"] == "no-store"
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        manifest = json.loads(z.read("manifest.json"))
        users = json.loads(z.read("tables/users.json"))
        assert manifest["format"] == "khayal-backup" and manifest["made_by"] == ADMIN
        assert manifest["tables"]["users"]["rows"] == len(users) == 5
        assert "stored_files" not in manifest["tables"]
        assert len(manifest["files"]) == 3  # the demo family's photos
        for entry in manifest["files"]:
            assert hashlib.sha256(z.read(f"files/{entry['key']}")).hexdigest() == entry["sha256"]
    assert any("Full backup downloaded by admin" in r.getMessage() and ADMIN in r.getMessage() for r in caplog.records)

    again = client.get("/api/admin/backup", headers=admin_headers)
    assert again.status_code == 429
    assert "Try again in 10 min" in again.json()["detail"]
    clock.now = NOW.replace(minute=41)
    assert client.get("/api/admin/backup", headers=admin_headers).status_code == 200


def test_backup_is_admin_only(client: TestClient, register: Register, admin_headers: dict[str, str]) -> None:
    caregiver = bearer(register("Priya", "priya@example.com", "caregiver"))
    assert client.get("/api/admin/backup", headers=caregiver).status_code == 403
    assert client.get("/api/admin/backup").status_code == 401
    # A refused request does not use up the one backup per 10 minutes.
    assert client.get("/api/admin/backup", headers=admin_headers).status_code == 200
