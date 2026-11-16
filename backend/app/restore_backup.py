"""Disaster recovery: restore a full backup (Admin → "Download full backup") into an empty database.

    python -m app.restore_backup data/backups/voroa/khayal-backup-2026-11-22.zip

Run from backend/ with the same KHAYAL_DATABASE_URL (or DATABASE_URL) and KHAYAL_STORAGE as the
app that will use the database. It refuses to run unless the target database is empty and at the
same migration revision as the backup, then restores every table (parents first) and every photo
and recording in one transaction, and finally checks row counts and file checksums.
Steps for Voroa: docs/BACKUP-RESTORE.md.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy.engine import make_url

from app import config
from app.db import SessionLocal
from app.services import backup


def _target() -> str:
    """The database address with the password hidden, to show what is about to be written."""
    return make_url(config.DATABASE_URL).render_as_string(hide_password=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.restore_backup", description=__doc__.split("\n\n")[0])
    parser.add_argument("zip", type=Path, help="the backup zip from Admin → Download full backup")
    args = parser.parse_args(argv)
    path: Path = args.zip
    if not path.is_file():
        print(f"No such file: {path}", file=sys.stderr)
        return 2
    print(f"Restoring {path}")
    print(f"  into database {_target()} (file storage: {config.STORAGE_BACKEND})")
    with SessionLocal() as db:
        try:
            report = backup.restore(db, path)
        except (backup.BackupError, backup.RestoreRefusedError) as error:
            db.rollback()
            print(f"Refused: {error}", file=sys.stderr)
            return 1
        print(f"  revision {report.revision}: {sum(report.rows.values())} rows in {len(report.rows)} tables, {report.files} files")
        problems = backup.verify(db, path)
    if problems:
        print("Restored, but the check found differences:", file=sys.stderr)
        for line in problems:
            print(f"  {line}", file=sys.stderr)
        return 1
    print("Done. Row counts and file checksums match the backup.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
