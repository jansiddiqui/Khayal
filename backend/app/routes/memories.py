"""Memory book (Round 2 batch 4): caregivers make pages; the elder and the family can see them."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.deps import CurrentCaregiver, CurrentUser, DbSession, Now, ensure_patient_access
from app.models import MemoryEntry, User
from app.schemas import FamilyPhotoOut, MemoryIn, MemoryOut
from app.services import activity, family, memories
from app.uploads import blocking, content_type, read_body

router = APIRouter(prefix="/patients/{patient_id}/memories", tags=["memories"])

PHOTO_TYPES = {"image/jpeg", "image/png"}


def _out(entry: MemoryEntry) -> MemoryOut:
    base = f"/patients/{entry.patient_id}/memories/{entry.id}"
    return MemoryOut(
        id=entry.id,
        patient_id=entry.patient_id,
        title=entry.title,
        story=entry.story,
        photos=[FamilyPhotoOut(id=n.removesuffix(".jpg"), url=f"{base}/photos/{n.removesuffix('.jpg')}") for n in entry.photo_paths],
        voice_url=f"{base}/voice" if entry.voice_path else None,
        voice_ms=entry.voice_ms,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def _patient(db: Session, user: User, patient_id: int) -> User:
    ensure_patient_access(db, user, patient_id)
    patient = db.get(User, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def _entry(db: Session, patient_id: int, entry_id: int) -> MemoryEntry:
    entry = memories.get(db, patient_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    return entry


PHOTOS_OFF = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Turn on photos for this person first.")
VOICE_OFF = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Voice notes need the voice opt-in for this person.")


@router.get("", response_model=list[MemoryOut])
def list_memories(patient_id: int, user: CurrentUser, db: DbSession) -> list[MemoryOut]:
    """Newest first. The elder sees only pages that have at least one photo."""
    patient = _patient(db, user, patient_id)
    entries = memories.entries_for(db, patient_id)
    if user.id == patient.id:
        entries = [e for e in entries if e.photo_paths]
    return [_out(e) for e in entries]


@router.post("", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
def create_memory(patient_id: int, body: MemoryIn, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> MemoryOut:
    patient = _patient(db, caregiver, patient_id)
    try:
        entry = memories.create(db, patient, caregiver, body.title, body.story, now)
    except memories.PhotosOffError:
        raise PHOTOS_OFF
    activity.record(db, patient_id, caregiver, "family", f"Memory added: {entry.title}", now)
    db.commit()
    return _out(entry)


@router.put("/{entry_id}", response_model=MemoryOut)
def update_memory(patient_id: int, entry_id: int, body: MemoryIn, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> MemoryOut:
    _patient(db, caregiver, patient_id)
    return _out(memories.update(db, _entry(db, patient_id, entry_id), body.title, body.story, now))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(patient_id: int, entry_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> Response:
    _patient(db, caregiver, patient_id)
    entry = _entry(db, patient_id, entry_id)
    activity.record(db, patient_id, caregiver, "family", f"Memory removed: {entry.title}", now)
    memories.delete(db, entry)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _photo_target(db: Session, caregiver: User, patient_id: int, entry_id: int) -> tuple[User, MemoryEntry]:
    patient = _patient(db, caregiver, patient_id)
    if not patient.photos_enabled:
        raise PHOTOS_OFF
    return patient, _entry(db, patient_id, entry_id)


def _add_photo(db: Session, patient: User, entry: MemoryEntry, data: bytes, now: Now) -> MemoryOut:
    try:
        memories.add_photo(db, patient, entry, data, now)
    except memories.MemoryBookError as exc:
        code = status.HTTP_409_CONFLICT if "up to" in str(exc) else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=code, detail=str(exc))
    return _out(entry)


@router.post("/{entry_id}/photos", response_model=MemoryOut, status_code=status.HTTP_201_CREATED)
async def upload_photo(patient_id: int, entry_id: int, request: Request, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> MemoryOut:
    """The request body is the image (JPG or PNG), like family photos."""
    patient, entry = await blocking(_photo_target, db, caregiver, patient_id, entry_id)
    if content_type(request) not in PHOTO_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only JPG and PNG photos are allowed.")
    data = await read_body(request, family.MAX_PHOTO_BYTES, "Photos must be 5 MB or smaller.")
    return await blocking(_add_photo, db, patient, entry, data, now)


@router.delete("/{entry_id}/photos/{photo_id}", response_model=MemoryOut)
def delete_photo(patient_id: int, entry_id: int, photo_id: str, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> MemoryOut:
    _patient(db, caregiver, patient_id)
    entry = _entry(db, patient_id, entry_id)
    if not memories.remove_photo(db, entry, photo_id, now):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return _out(entry)


@router.get("/{entry_id}/photos/{photo_id}", response_class=Response)
def get_photo(patient_id: int, entry_id: int, photo_id: str, user: CurrentUser, db: DbSession) -> Response:
    _patient(db, user, patient_id)
    data = memories.photo_data(db, _entry(db, patient_id, entry_id), photo_id)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})


def _voice_target(db: Session, caregiver: User, patient_id: int, entry_id: int) -> tuple[User, MemoryEntry]:
    patient = _patient(db, caregiver, patient_id)
    if not patient.voice_task_enabled:
        raise VOICE_OFF
    return patient, _entry(db, patient_id, entry_id)


def _set_voice(db: Session, patient: User, entry: MemoryEntry, data: bytes, kind: str, duration_ms: int, now: Now) -> MemoryOut:
    try:
        memories.set_voice(db, patient, entry, data, kind, duration_ms, now)
    except memories.MemoryBookError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return _out(entry)


@router.post("/{entry_id}/voice", response_model=MemoryOut)
async def upload_voice(
    patient_id: int, entry_id: int, request: Request, caregiver: CurrentCaregiver, db: DbSession, now: Now,
    duration_ms: Annotated[int, Query(gt=0)],
) -> MemoryOut:
    """The family's voice note for this page (WebM or Ogg, up to 5 minutes); replaces an earlier one."""
    patient, entry = await blocking(_voice_target, db, caregiver, patient_id, entry_id)
    data = await read_body(request, memories.MAX_VOICE_BYTES, "Voice notes can be up to 5 minutes long.")
    return await blocking(_set_voice, db, patient, entry, data, content_type(request), duration_ms, now)


@router.delete("/{entry_id}/voice", response_model=MemoryOut)
def delete_voice(patient_id: int, entry_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> MemoryOut:
    _patient(db, caregiver, patient_id)
    entry = _entry(db, patient_id, entry_id)
    if not memories.remove_voice(db, entry, now):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No voice note")
    return _out(entry)


@router.get("/{entry_id}/voice", response_class=Response)
def get_voice(patient_id: int, entry_id: int, user: CurrentUser, db: DbSession) -> Response:
    _patient(db, user, patient_id)
    entry = _entry(db, patient_id, entry_id)
    data = memories.voice_data(db, entry)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No voice note")
    return Response(data, media_type=entry.voice_type or "audio/webm", headers={"Cache-Control": "private, no-store"})
