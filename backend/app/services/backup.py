"""Full backup and restore of the whole Khayal database, run inside the backend.

The free hosted database has no backups of its own and cannot be reached from outside its
workspace, so the admin downloads a zip from the app instead (Admin → "Download full backup")
and `python -m app.restore_backup <zip>` puts it back after a disaster. See docs/BACKUP-RESTORE.md.

Zip layout (format "khayal-backup", version 1):

- manifest.json: when and where it was made, the Alembic revision of the database, the column
  types of every table (so a restore can decode the values), row counts, and every stored file
  with its owner, type, size and SHA-256.
- tables/<table>.json: every row of every table, as a JSON list of objects. `stored_files`
  (photos and recordings kept in the database) is not a table here: its contents are the files.
- files/<key>: each photo and recording, e.g. files/family/3/<hex>.jpg.

Tables are read and written through database reflection, not the app's models, so a backup can
be restored into a database at the same migration revision even when the code has moved on.
"""

import hashlib
import io
import json
import logging
import re
import zipfile
from base64 import b64decode, b64encode
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import IO, Any

from alembic.runtime.migration import MigrationContext
from sqlalchemy import Connection, MetaData, Table, func, insert, select, text
from sqlalchemy import types as satypes
from sqlalchemy.orm import Session

from app import config
from app.models import StoredFile
from app.services import storage

log = logging.getLogger("khayal.backup")

FORMAT = "khayal-backup"
FORMAT_VERSION = 1
# Not data: Alembic's own bookkeeping, and the file table (its rows travel as files/).
SKIP_TABLES = frozenset({"alembic_version", StoredFile.__tablename__})
_CONTENT_TYPES = {".jpg": "image/jpeg", ".webm": "audio/webm", ".ogg": "audio/ogg"}
_BATCH = 500


class BackupError(RuntimeError):
    """The zip is not a Khayal backup this code can read, or does not match its manifest."""


class RestoreRefusedError(RuntimeError):
    """The target is not safe to restore into (not empty, or at another migration revision)."""


# --- column values <-> JSON -------------------------------------------------------------------


def _kind(column_type: satypes.TypeEngine[Any]) -> str:
    """How a column's values are written in the JSON files (recorded per column in the manifest)."""
    if isinstance(column_type, satypes.DateTime):
        return "datetime"
    if isinstance(column_type, satypes.Date):
        return "date"
    if isinstance(column_type, satypes.Time):
        return "time"
    if isinstance(column_type, satypes.JSON):
        return "json"
    if isinstance(column_type, satypes._Binary):
        return "bytes"
    return "plain"


def _encode(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return b64encode(bytes(value)).decode("ascii")
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    return value


def _decode(value: Any, kind: str) -> Any:
    if value is None:
        return None
    if kind == "datetime":
        return datetime.fromisoformat(value)
    if kind == "date":
        return date.fromisoformat(value)
    if kind == "time":
        return time.fromisoformat(value)
    if kind == "bytes":
        return b64decode(value)
    return value


# --- reading the database ---------------------------------------------------------------------


def revision(connection: Connection) -> str | None:
    """The database's current Alembic revision (None if it was never migrated)."""
    return MigrationContext.configure(connection).get_current_revision()


def reflect(connection: Connection) -> MetaData:
    metadata = MetaData()
    metadata.reflect(bind=connection)
    return metadata


def data_tables(metadata: MetaData) -> list[Table]:
    """Every data table, parents before children (the order rows must be inserted in)."""
    return [t for t in metadata.sorted_tables if t.name not in SKIP_TABLES]


def _order_by(table: Table) -> list[Any]:
    return list(table.primary_key.columns) or list(table.columns)


@dataclass(frozen=True)
class FileEntry:
    key: str
    owner_id: int
    content_type: str


def _file_entries(db: Session) -> list[FileEntry]:
    """Every stored photo and recording, from whichever storage backend is in use."""
    if config.STORAGE_BACKEND == "db":
        rows = db.execute(select(StoredFile.key, StoredFile.owner_id, StoredFile.content_type).order_by(StoredFile.key))
        return [FileEntry(key, owner, ctype) for key, owner, ctype in rows]
    entries = []
    root = config.UPLOAD_DIR
    if root.is_dir():
        for path in sorted(root.rglob("*")):  # read-only walk of the upload folder
            key = path.relative_to(root).as_posix()
            if path.is_file() and storage.valid_key(key):
                entries.append(FileEntry(key, int(key.split("/")[1]), _CONTENT_TYPES[path.suffix]))
    return entries


# --- making a backup --------------------------------------------------------------------------


@dataclass
class Summary:
    tables: int = 0
    rows: int = 0
    files: int = 0
    file_bytes: int = 0
    revision: str | None = None


def _write_table(z: zipfile.ZipFile, connection: Connection, table: Table) -> int:
    """Stream one table into tables/<name>.json, a batch of rows at a time."""
    count = 0
    names = [c.name for c in table.columns]
    with z.open(f"tables/{table.name}.json", "w", force_zip64=True) as raw:
        out = io.TextIOWrapper(raw, encoding="utf-8")
        out.write("[")
        # Streaming is set on this one statement: Connection.execution_options would change the
        # session's connection for every later statement too (later writes would fail on Postgres).
        result = connection.execute(
            select(table).order_by(*_order_by(table)),
            execution_options={"stream_results": True, "yield_per": _BATCH},
        )
        for row in result:
            out.write(",\n" if count else "\n")
            out.write(json.dumps({n: _encode(v) for n, v in zip(names, row, strict=True)}, ensure_ascii=False))
            count += 1
        out.write("\n]\n")
        out.flush()
        out.detach()
    return count


def write(db: Session, out: IO[bytes], now: datetime, made_by: str) -> Summary:
    """Write a full backup zip of the database behind `db` to `out`."""
    connection = db.connection()
    metadata = reflect(connection)
    summary = Summary(revision=revision(connection))
    tables_info: dict[str, Any] = {}
    files_info: list[dict[str, Any]] = []
    store = storage.get()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for table in data_tables(metadata):
            kinds = {c.name: _kind(c.type) for c in table.columns}
            rows = _write_table(z, connection, table)
            tables_info[table.name] = {"rows": rows, "columns": kinds}
            summary.tables += 1
            summary.rows += rows
        for entry in _file_entries(db):
            data = store.load(db, entry.key)
            if data is None:
                continue
            # Photos and recordings are already compressed.
            z.writestr(f"files/{entry.key}", data, compress_type=zipfile.ZIP_STORED)
            files_info.append(
                {
                    "key": entry.key,
                    "owner_id": entry.owner_id,
                    "content_type": entry.content_type,
                    "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
            summary.files += 1
            summary.file_bytes += len(data)
        manifest = {
            "format": FORMAT,
            "format_version": FORMAT_VERSION,
            "created_at": now.isoformat(),
            "made_by": made_by,
            "alembic_revision": summary.revision,
            "dialect": connection.dialect.name,
            "storage_backend": config.STORAGE_BACKEND,
            "tables": tables_info,
            "files": files_info,
        }
        z.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))
    return summary


# --- restoring --------------------------------------------------------------------------------


@dataclass
class Report:
    revision: str | None
    rows: dict[str, int] = field(default_factory=dict)
    files: int = 0


def read_manifest(z: zipfile.ZipFile) -> dict[str, Any]:
    try:
        manifest: dict[str, Any] = json.loads(z.read("manifest.json"))
    except KeyError:
        raise BackupError("This zip has no manifest.json; it is not a Khayal full backup.") from None
    if manifest.get("format") != FORMAT:
        raise BackupError("This zip is not a Khayal full backup (an 'Export my data' zip cannot be restored).")
    if manifest.get("format_version") != FORMAT_VERSION:
        raise BackupError(f"Backup format version {manifest.get('format_version')} is not supported by this code.")
    return manifest


def check_files(z: zipfile.ZipFile, manifest: dict[str, Any]) -> None:
    """Every file listed is in the zip, with the recorded size and SHA-256."""
    for entry in manifest["files"]:
        storage.check_key(entry["key"])
        try:
            data = z.read(f"files/{entry['key']}")
        except KeyError:
            raise BackupError(f"files/{entry['key']} is missing from the zip") from None
        if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise BackupError(f"files/{entry['key']} does not match its checksum; the zip is damaged")


def _rows(z: zipfile.ZipFile, name: str, kinds: dict[str, str]) -> list[dict[str, Any]]:
    try:
        raw: list[dict[str, Any]] = json.loads(z.read(f"tables/{name}.json"))
    except KeyError:
        raise BackupError(f"tables/{name}.json is missing from the zip") from None
    return [{c: _decode(v, kinds[c]) for c, v in row.items()} for row in raw]


def _batches(rows: list[dict[str, Any]]) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), _BATCH):
        yield rows[start : start + _BATCH]


_SAFE_NAME = re.compile(r"^[a-z_][a-z0-9_]*$")


def _reset_sequences(connection: Connection, tables: list[Table]) -> None:
    """Postgres: move each id sequence past the restored ids, so new rows don't collide."""
    if connection.dialect.name != "postgresql":
        return
    for table in tables:
        pk = list(table.primary_key.columns)
        if len(pk) != 1 or not isinstance(pk[0].type, satypes.Integer):
            continue
        name, col = table.name, pk[0].name
        if not (_SAFE_NAME.match(name) and _SAFE_NAME.match(col)):  # names come from reflection, never from the zip
            continue
        sequence = connection.scalar(text("SELECT pg_get_serial_sequence(:t, :c)"), {"t": name, "c": col})
        if sequence is None:
            continue
        connection.execute(
            text(f'SELECT setval(:s, COALESCE(MAX("{col}"), 1), MAX("{col}") IS NOT NULL) FROM "{name}"'),
            {"s": sequence},
        )


def preflight(connection: Connection, manifest: dict[str, Any], db: Session) -> list[Table]:
    """Refuse unless the target is at the backup's revision, has every table and column, and is empty."""
    current = revision(connection)
    wanted = manifest["alembic_revision"]
    if wanted is None:
        raise RestoreRefusedError("The backup does not record a migration revision; it cannot be checked.")
    if current != wanted:
        raise RestoreRefusedError(
            f"The target database is at migration revision {current or 'none'}, the backup at {wanted}. "
            f"Bring the empty target to {wanted} first (from backend/: alembic upgrade {wanted})."
        )
    tables = {t.name: t for t in data_tables(reflect(connection))}
    for name, info in manifest["tables"].items():
        table = tables.get(name)
        if table is None:
            raise RestoreRefusedError(f"The target database has no table {name}.")
        missing = set(info["columns"]) - {c.name for c in table.columns}
        if missing:
            raise RestoreRefusedError(f"Table {name} in the target has no column(s) {', '.join(sorted(missing))}.")
    for table in [*tables.values(), StoredFile.__table__]:
        if connection.scalar(select(func.count()).select_from(table)):
            raise RestoreRefusedError(
                f"The target database is not empty (table {table.name} has rows). "
                "Restore only into a new, empty database."
            )
    store = storage.get()
    for entry in manifest["files"]:
        if store.load(db, entry["key"]) is not None:
            raise RestoreRefusedError(f"A stored file already exists at {entry['key']}; the target is not empty.")
    return [t for t in tables.values() if t.name in manifest["tables"]]


def restore(db: Session, zip_file: Path | IO[bytes]) -> Report:
    """Restore a backup into the empty database behind `db`, in one transaction: rows parents-first,
    then the files. Disk-stored files are written after the rows are committed."""
    with zipfile.ZipFile(zip_file) as z:
        manifest = read_manifest(z)
        check_files(z, manifest)
        connection = db.connection()
        tables = preflight(connection, manifest, db)
        order = {t.name: i for i, t in enumerate(data_tables(reflect(connection)))}
        report = Report(revision=manifest["alembic_revision"])
        for table in sorted(tables, key=lambda t: order[t.name]):
            rows = _rows(z, table.name, manifest["tables"][table.name]["columns"])
            for batch in _batches(rows):
                connection.execute(insert(table), batch)
            report.rows[table.name] = len(rows)
        _reset_sequences(connection, tables)
        store = storage.get()
        on_disk = config.STORAGE_BACKEND == "disk"
        if not on_disk:
            for entry in manifest["files"]:
                store.save(db, entry["key"], entry["owner_id"], z.read(f"files/{entry['key']}"), entry["content_type"])
                db.flush()
        db.commit()
        if on_disk:
            for entry in manifest["files"]:
                store.save(db, entry["key"], entry["owner_id"], z.read(f"files/{entry['key']}"), entry["content_type"])
        report.files = len(manifest["files"])
    return report


def verify(db: Session, zip_file: Path | IO[bytes]) -> list[str]:
    """Compare the database with a backup: row counts per table and every file's SHA-256.
    Returns the differences (empty when they match)."""
    problems = []
    with zipfile.ZipFile(zip_file) as z:
        manifest = read_manifest(z)
    connection = db.connection()
    tables = {t.name: t for t in data_tables(reflect(connection))}
    for name, info in manifest["tables"].items():
        table = tables.get(name)
        count = connection.scalar(select(func.count()).select_from(table)) if table is not None else None
        if count != info["rows"]:
            problems.append(f"{name}: {count} rows, backup has {info['rows']}")
    store = storage.get()
    for entry in manifest["files"]:
        data = store.load(db, entry["key"])
        if data is None or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            problems.append(f"file {entry['key']} is missing or different")
    return problems
