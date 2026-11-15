"""A caregiver adds an elder (the patient): name, city, optional photo. No email or password:
the elder's device signs in with a pairing code (services/pairing.py)."""

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import ConsentKind, Role, User
from app.services import auth, care, consent, family, storage


class PhotosOffError(Exception):
    """Photos need the separate photos opt-in for this elder."""


def add(
    db: Session,
    caregiver: User,
    *,
    name: str,
    city: str | None,
    basis: str,
    photos: bool,
    voice: bool,
    now: datetime,
) -> User:
    """Create the elder, link the caregiver, and record the consents given in the same form."""
    elder = auth.register_user(db, name=name, email=None, role=Role.patient, commit=False)
    elder.city = city or None
    db.flush()
    consent.record(db, caregiver, ConsentKind.elder_on_behalf, now, elder, basis=basis)
    db.commit()
    care.link_patient(db, caregiver, elder)
    if photos:
        consent.set_photos(db, caregiver, elder, True, now)
    if voice:
        consent.set_voice(db, caregiver, elder, True, now)
    return elder


def set_photo(db: Session, elder: User, data: bytes) -> None:
    """The elder's own photo (resized like family photos). Needs the photos opt-in."""
    if not elder.photos_enabled:
        raise PhotosOffError()
    jpeg = family.prepare_photo(data)
    store = storage.get()
    if elder.photo_key:
        store.delete(db, elder.photo_key)
    key = f"profile/{elder.id}/{uuid.uuid4().hex}.jpg"
    store.save(db, key, elder.id, jpeg, "image/jpeg")
    elder.photo_key = key
    db.commit()


def photo(db: Session, elder: User) -> bytes | None:
    return storage.get().load(db, elder.photo_key) if elder.photo_key else None


def remove_photo(db: Session, elder: User) -> bool:
    if not elder.photo_key:
        return False
    storage.get().delete(db, elder.photo_key)
    elder.photo_key = None
    db.commit()
    return True
