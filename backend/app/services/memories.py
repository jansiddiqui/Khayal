"""Memory book (Round 2 batch 4): reminiscence pages the family makes for the elder.

Each page has 1-5 photos (needs the elder's photos opt-in), a title, a short story, and an
optional family voice note recorded in the browser (needs the voice opt-in too). The elder
browses them on the "Memories" side of "Who is this?". Withdrawing photos deletes every page;
withdrawing voice deletes the voice notes only.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MemoryEntry, User
from app.services import family, speech, storage

MAX_PHOTOS = 5
MAX_VOICE_BYTES = 6 * 1024 * 1024  # about 5 minutes of Opus
MAX_VOICE_MS = 5 * 60 * 1000


class MemoryBookError(ValueError):
    """A page or file that can't be stored (the message is shown to the caregiver)."""


class PhotosOffError(Exception):
    pass


class VoiceOffError(Exception):
    pass


def key(patient_id: int, file_name: str) -> str:
    return f"memory/{patient_id}/{file_name}"


def entries_for(db: Session, patient_id: int) -> list[MemoryEntry]:
    return list(
        db.scalars(select(MemoryEntry).where(MemoryEntry.patient_id == patient_id).order_by(MemoryEntry.created_at.desc(), MemoryEntry.id.desc()))
    )


def get(db: Session, patient_id: int, entry_id: int) -> MemoryEntry | None:
    entry = db.get(MemoryEntry, entry_id)
    return entry if entry is not None and entry.patient_id == patient_id else None


def create(db: Session, patient: User, caregiver: User, title: str, story: str, now: datetime) -> MemoryEntry:
    if not patient.photos_enabled:
        raise PhotosOffError()
    entry = MemoryEntry(patient_id=patient.id, title=title.strip(), story=story.strip(), photo_paths=[],
                        created_by=caregiver.id, created_at=now, updated_at=now)
    db.add(entry)
    db.commit()
    return entry


def update(db: Session, entry: MemoryEntry, title: str, story: str, now: datetime) -> MemoryEntry:
    entry.title, entry.story, entry.updated_at = title.strip(), story.strip(), now
    db.commit()
    return entry


def add_photo(db: Session, patient: User, entry: MemoryEntry, data: bytes, now: datetime) -> str:
    if not patient.photos_enabled:
        raise PhotosOffError()
    if len(entry.photo_paths) >= MAX_PHOTOS:
        raise MemoryBookError(f"A memory can have up to {MAX_PHOTOS} photos.")
    try:
        jpeg = family.prepare_photo(data)
    except family.PhotoError as exc:
        raise MemoryBookError(str(exc)) from exc
    photo_id = uuid.uuid4().hex
    storage.get().save(db, key(entry.patient_id, f"{photo_id}.jpg"), entry.patient_id, jpeg, "image/jpeg")
    entry.photo_paths = [*entry.photo_paths, f"{photo_id}.jpg"]
    entry.updated_at = now
    db.commit()
    return photo_id


def _photo_name(entry: MemoryEntry, photo_id: str) -> str | None:
    name = f"{photo_id}.jpg"
    return name if len(photo_id) == 32 and name in entry.photo_paths else None


def photo_data(db: Session, entry: MemoryEntry, photo_id: str) -> bytes | None:
    name = _photo_name(entry, photo_id)
    return storage.get().load(db, key(entry.patient_id, name)) if name else None


def remove_photo(db: Session, entry: MemoryEntry, photo_id: str, now: datetime) -> bool:
    name = _photo_name(entry, photo_id)
    if name is None:
        return False
    storage.get().delete(db, key(entry.patient_id, name))
    entry.photo_paths = [p for p in entry.photo_paths if p != name]
    entry.updated_at = now
    db.commit()
    return True


def set_voice(db: Session, patient: User, entry: MemoryEntry, data: bytes, content_type: str, duration_ms: int, now: datetime) -> None:
    if not patient.voice_task_enabled:
        raise VoiceOffError()
    if content_type not in speech.AUDIO_TYPES:
        raise MemoryBookError("Voice notes must be WebM or Ogg audio.")
    extension, magic = speech.AUDIO_TYPES[content_type]
    if len(data) > MAX_VOICE_BYTES or not 0 < duration_ms <= MAX_VOICE_MS:
        raise MemoryBookError("Voice notes can be up to 5 minutes long.")
    if not data.startswith(magic):
        raise MemoryBookError("That file is not a recording we can open.")
    remove_voice(db, entry, now, commit=False)
    name = f"{uuid.uuid4().hex}.{extension}"
    storage.get().save(db, key(entry.patient_id, name), entry.patient_id, data, content_type)
    entry.voice_path, entry.voice_type, entry.voice_ms, entry.updated_at = name, content_type, duration_ms, now
    db.commit()


def voice_data(db: Session, entry: MemoryEntry) -> bytes | None:
    return storage.get().load(db, key(entry.patient_id, entry.voice_path)) if entry.voice_path else None


def remove_voice(db: Session, entry: MemoryEntry, now: datetime, commit: bool = True) -> bool:
    if not entry.voice_path:
        return False
    storage.get().delete(db, key(entry.patient_id, entry.voice_path))
    entry.voice_path = entry.voice_type = None
    entry.voice_ms = None
    entry.updated_at = now
    if commit:
        db.commit()
    return True


def delete(db: Session, entry: MemoryEntry) -> None:
    store = storage.get()
    for name in entry.photo_paths:
        store.delete(db, key(entry.patient_id, name))
    if entry.voice_path:
        store.delete(db, key(entry.patient_id, entry.voice_path))
    db.delete(entry)
    db.commit()


def file_keys(db: Session, patient_id: int) -> list[str]:
    out: list[str] = []
    for entry in entries_for(db, patient_id):
        out += [key(patient_id, n) for n in entry.photo_paths]
        if entry.voice_path:
            out.append(key(patient_id, entry.voice_path))
    return out


def withdraw_photos(db: Session, patient_id: int) -> int:
    """Photos opt-in withdrawn: every page goes (a page is built on its photos). Caller commits."""
    store = storage.get()
    entries = entries_for(db, patient_id)
    for k in file_keys(db, patient_id):
        store.delete(db, k)
    for entry in entries:
        db.delete(entry)
    return len(entries)


def withdraw_voice(db: Session, patient_id: int, now: datetime) -> int:
    """Voice opt-in withdrawn: the family voice notes go, the pages stay. Caller commits."""
    removed = 0
    for entry in entries_for(db, patient_id):
        if remove_voice(db, entry, now, commit=False):
            removed += 1
    return removed
