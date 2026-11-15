"""Where uploaded files (family photos, voice recordings) are kept.

Two backends behind one interface, chosen by KHAYAL_STORAGE:

- "disk" (development default): files under data/uploads/{key}.
- "db" (production default): rows in the `stored_files` table, for hosts with no
  persistent disk and no object storage. The row is added to the caller's session, so it
  is saved in the same commit as the photo list or recording row that points to it.

Keys are always built by this app (family/{patient_id}/{hex}.jpg, speech/{patient_id}/{hex}.webm),
never taken from a request, and checked against a strict pattern before touching the disk.
"""

import os
import re
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app import config
from app.models import StoredFile

_KEY = re.compile(r"^(family|speech)/\d+/[0-9a-f]{32}\.(jpg|webm|ogg)$")


class InvalidKeyError(ValueError):
    pass


def check_key(key: str) -> str:
    if not _KEY.match(key):
        raise InvalidKeyError(key)
    return key


class Storage(Protocol):
    def save(self, db: Session, key: str, owner_id: int, data: bytes, content_type: str) -> None: ...

    def load(self, db: Session, key: str) -> bytes | None: ...

    def delete(self, db: Session, key: str) -> None: ...

    def delete_owner(self, db: Session, owner_id: int, keys: list[str]) -> None:
        """Remove every file of one patient (`keys` = the ones the app knows about)."""
        ...

    @contextmanager
    def local_path(self, db: Session, key: str) -> Iterator[Path | None]:
        """A real file path for code that needs one (the speech model); None if missing."""
        ...


class DiskStorage:
    def _path(self, key: str) -> Path:
        return config.UPLOAD_DIR / check_key(key)

    def save(self, db: Session, key: str, owner_id: int, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def load(self, db: Session, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, db: Session, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_owner(self, db: Session, owner_id: int, keys: list[str]) -> None:
        for key in keys:  # one known file at a time; never a recursive delete
            self.delete(db, key)

    @contextmanager
    def local_path(self, db: Session, key: str) -> Iterator[Path | None]:
        path = self._path(key)
        yield path if path.is_file() else None


class DatabaseStorage:
    def save(self, db: Session, key: str, owner_id: int, data: bytes, content_type: str) -> None:
        db.add(StoredFile(key=check_key(key), owner_id=owner_id, content_type=content_type, size=len(data), data=data))

    def load(self, db: Session, key: str) -> bytes | None:
        row = db.get(StoredFile, check_key(key))
        return row.data if row is not None else None

    def delete(self, db: Session, key: str) -> None:
        db.execute(delete(StoredFile).where(StoredFile.key == check_key(key)))

    def delete_owner(self, db: Session, owner_id: int, keys: list[str]) -> None:
        db.execute(delete(StoredFile).where(StoredFile.owner_id == owner_id))

    @contextmanager
    def local_path(self, db: Session, key: str) -> Iterator[Path | None]:
        data = self.load(db, key)
        if data is None:
            yield None
            return
        handle, name = tempfile.mkstemp(suffix=Path(key).suffix)
        try:
            with os.fdopen(handle, "wb") as f:
                f.write(data)
            yield Path(name)
        finally:
            Path(name).unlink(missing_ok=True)


_BACKENDS: dict[str, Storage] = {"disk": DiskStorage(), "db": DatabaseStorage()}


def get() -> Storage:
    """The configured backend (read on every call, so tests can switch it)."""
    return _BACKENDS[config.STORAGE_BACKEND]
