"""Family members and their private photos.

Photos are JPG/PNG up to 5 MB, re-encoded as JPEG no larger than 800 px on the long
side (which also drops EXIF metadata such as GPS), at most 5 per person, stored under
data/uploads/family/{patient_id}/. They are only ever served by an authenticated route.
"""

import io
import re
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.models import FamilyMember

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_SIDE = 800
MAX_PHOTOS = 5
ALLOWED_FORMATS = frozenset({"JPEG", "PNG"})
JPEG_QUALITY = 85
_PHOTO_ID = re.compile(r"^[0-9a-f]{32}$")


class PhotoError(Exception):
    """A photo that can't be accepted; the message is safe to show the caregiver."""


class TooManyPhotosError(PhotoError):
    pass


def photo_dir(patient_id: int) -> Path:
    return config.UPLOAD_DIR / "family" / str(patient_id)


def photo_ids(member: FamilyMember) -> list[str]:
    return [Path(name).stem for name in member.photo_paths]


def members_for(db: Session, patient_id: int) -> list[FamilyMember]:
    return list(
        db.scalars(select(FamilyMember).where(FamilyMember.patient_id == patient_id).order_by(FamilyMember.id))
    )


def prepare_photo(data: bytes) -> bytes:
    """Check the bytes really are a JPG/PNG within limits and return a resized JPEG."""
    if len(data) > MAX_PHOTO_BYTES:
        raise PhotoError("Photos must be 5 MB or smaller.")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise PhotoError("Only JPG and PNG photos are allowed.")
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)  # keep phone photos the right way up
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.getchannel("A"))
                img = background
            else:
                img = img.convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise PhotoError("That file is not a photo we can open.") from exc


def add_photo(db: Session, member: FamilyMember, data: bytes) -> str:
    if len(member.photo_paths) >= MAX_PHOTOS:
        raise TooManyPhotosError(f"Each person can have up to {MAX_PHOTOS} photos.")
    jpeg = prepare_photo(data)
    photo_id = uuid.uuid4().hex
    folder = photo_dir(member.patient_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{photo_id}.jpg").write_bytes(jpeg)
    member.photo_paths = [*member.photo_paths, f"{photo_id}.jpg"]  # new list so the JSON change is saved
    db.commit()
    return photo_id


def photo_file(member: FamilyMember, photo_id: str) -> Path | None:
    """The file for one of this member's photos, or None (never a path outside their folder)."""
    if not _PHOTO_ID.match(photo_id) or f"{photo_id}.jpg" not in member.photo_paths:
        return None
    path = photo_dir(member.patient_id) / f"{photo_id}.jpg"
    return path if path.is_file() else None


def remove_photo(db: Session, member: FamilyMember, photo_id: str) -> bool:
    if not _PHOTO_ID.match(photo_id) or f"{photo_id}.jpg" not in member.photo_paths:
        return False
    (photo_dir(member.patient_id) / f"{photo_id}.jpg").unlink(missing_ok=True)
    member.photo_paths = [p for p in member.photo_paths if p != f"{photo_id}.jpg"]
    db.commit()
    return True


def delete_member(db: Session, member: FamilyMember) -> None:
    for name in member.photo_paths:
        (photo_dir(member.patient_id) / name).unlink(missing_ok=True)
    db.delete(member)
    db.commit()
