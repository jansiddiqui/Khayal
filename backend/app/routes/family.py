from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.deps import CurrentCaregiver, CurrentUser, DbSession, ensure_patient_access
from app.models import FamilyMember
from app.schemas import FamilyMemberIn, FamilyMemberOut, FamilyPhotoOut
from app.services import family

router = APIRouter(prefix="/patients/{patient_id}/family", tags=["family"])

PHOTO_TYPES = {"image/jpeg", "image/png"}


def _out(member: FamilyMember) -> FamilyMemberOut:
    base = f"/patients/{member.patient_id}/family/{member.id}/photos"
    return FamilyMemberOut(
        id=member.id,
        patient_id=member.patient_id,
        name=member.name,
        relation=member.relation,
        note=member.note,
        photos=[FamilyPhotoOut(id=pid, url=f"{base}/{pid}") for pid in family.photo_ids(member)],
    )


def _member(db: Session, patient_id: int, member_id: int) -> FamilyMember:
    member = db.get(FamilyMember, member_id)
    if member is None or member.patient_id != patient_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family member not found")
    return member


@router.get("", response_model=list[FamilyMemberOut])
def list_family(patient_id: int, user: CurrentUser, db: DbSession) -> list[FamilyMemberOut]:
    ensure_patient_access(db, user, patient_id)
    return [_out(m) for m in family.members_for(db, patient_id)]


@router.post("", response_model=FamilyMemberOut, status_code=status.HTTP_201_CREATED)
def add_family_member(patient_id: int, body: FamilyMemberIn, caregiver: CurrentCaregiver, db: DbSession) -> FamilyMemberOut:
    ensure_patient_access(db, caregiver, patient_id)
    member = FamilyMember(patient_id=patient_id, name=body.name, relation=body.relation, note=body.note or None)
    db.add(member)
    db.commit()
    return _out(member)


@router.put("/{member_id}", response_model=FamilyMemberOut)
def update_family_member(
    patient_id: int, member_id: int, body: FamilyMemberIn, caregiver: CurrentCaregiver, db: DbSession
) -> FamilyMemberOut:
    ensure_patient_access(db, caregiver, patient_id)
    member = _member(db, patient_id, member_id)
    member.name, member.relation, member.note = body.name, body.relation, body.note or None
    db.commit()
    return _out(member)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_family_member(patient_id: int, member_id: int, caregiver: CurrentCaregiver, db: DbSession) -> Response:
    ensure_patient_access(db, caregiver, patient_id)
    family.delete_member(db, _member(db, patient_id, member_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{member_id}/photos", response_model=FamilyMemberOut, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    patient_id: int, member_id: int, request: Request, caregiver: CurrentCaregiver, db: DbSession
) -> FamilyMemberOut:
    """The request body is the image itself (Content-Type image/jpeg or image/png)."""
    ensure_patient_access(db, caregiver, patient_id)
    member = _member(db, patient_id, member_id)
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in PHOTO_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only JPG and PNG photos are allowed.")
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > family.MAX_PHOTO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photos must be 5 MB or smaller.")

    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > family.MAX_PHOTO_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photos must be 5 MB or smaller.")
    try:
        family.add_photo(db, member, bytes(data))
    except family.TooManyPhotosError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except family.PhotoError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return _out(member)


@router.delete("/{member_id}/photos/{photo_id}", response_model=FamilyMemberOut)
def delete_photo(patient_id: int, member_id: int, photo_id: str, caregiver: CurrentCaregiver, db: DbSession) -> FamilyMemberOut:
    ensure_patient_access(db, caregiver, patient_id)
    member = _member(db, patient_id, member_id)
    if not family.remove_photo(db, member, photo_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return _out(member)


@router.get("/{member_id}/photos/{photo_id}", response_class=FileResponse)
def get_photo(patient_id: int, member_id: int, photo_id: str, user: CurrentUser, db: DbSession) -> FileResponse:
    """Private family photo: only the patient and their linked caregivers may fetch it."""
    ensure_patient_access(db, user, patient_id)
    path = family.photo_file(_member(db, patient_id, member_id), photo_id)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
