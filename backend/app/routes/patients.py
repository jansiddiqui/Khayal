from fastapi import APIRouter, HTTPException, Request, Response, status

from app.deps import CurrentCaregiver, CurrentUser, DbSession, Now, ensure_patient_access
from app.models import Role, User
from app.presenters import patient_out
from app.schemas import (
    AddElderIn,
    ConsentOut,
    ConsentToggleIn,
    ConsentToggleOut,
    DeviceOut,
    LinkOut,
    PairingCodeOut,
    PatientOut,
    PatientSummaryOut,
    PatientUpdateIn,
    ShareAcceptIn,
    ShareOut,
)
from app.services import auth, care, consent, decline, devices, elders, family, invites, pairing
from app.uploads import blocking, content_type, read_body

router = APIRouter(tags=["patients"])

PHOTO_TYPES = {"image/jpeg", "image/png"}


def _elder(db: DbSession, caregiver: User, patient_id: int) -> User:
    ensure_patient_access(db, caregiver, patient_id)
    patient = db.get(User, patient_id)
    if patient is None or patient.role != Role.patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


@router.get("/patients", response_model=list[PatientSummaryOut])
def list_patients(caregiver: CurrentCaregiver, db: DbSession, now: Now) -> list[PatientSummaryOut]:
    out: list[PatientSummaryOut] = []
    for p in care.linked_patients(db, caregiver):
        result = decline.overview(db, p.id, until=now)
        out.append(
            PatientSummaryOut(
                **patient_out(p).model_dump(),
                cognitive_index=result.index,
                cognitive_status=result.status,
            )
        )
    return out


@router.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def add_elder(body: AddElderIn, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> PatientOut:
    """Add the elder you look after (no email needed), with the consents given in the same form."""
    elder = elders.add(
        db, caregiver, name=body.name, city=body.city, basis=body.basis, photos=body.photos, voice=body.voice, now=now
    )
    return patient_out(elder)


@router.post("/patients/{patient_id}/pairing-code", response_model=PairingCodeOut, status_code=status.HTTP_201_CREATED)
def create_pairing_code(patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> PairingCodeOut:
    """A one-time 6-digit code (valid 10 minutes) for signing in the patient's own device."""
    patient = _elder(db, caregiver, patient_id)
    new = pairing.create_code(db, caregiver, patient, now)
    return PairingCodeOut(code=new.code, expires_at=new.expires_at)


@router.patch("/patients/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int, body: PatientUpdateIn, caregiver: CurrentCaregiver, db: DbSession, now: Now
) -> PatientOut:
    patient = _elder(db, caregiver, patient_id)
    if "city" in body.model_fields_set:
        patient.city = body.city or None
    if "pinned_games" in body.model_fields_set:
        patient.pinned_games = [g.value for g in body.pinned_games] if body.pinned_games else None
    db.commit()
    if body.voice_task_enabled is not None:
        # Turning the voice task off is withdrawing the voice consent: recordings are deleted.
        consent.set_voice(db, caregiver, patient, body.voice_task_enabled, now)
    return patient_out(patient)


# --- consent ------------------------------------------------------------------------------


@router.post("/patients/{patient_id}/consents", response_model=ConsentToggleOut)
def toggle_consent(patient_id: int, body: ConsentToggleIn, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> ConsentToggleOut:
    """Opt in to, or withdraw, family photos or voice recordings. Withdrawing deletes that data."""
    patient = _elder(db, caregiver, patient_id)
    setter = consent.set_photos if body.kind == "photos" else consent.set_voice
    deleted = setter(db, caregiver, patient, body.granted, now)
    return ConsentToggleOut(patient=patient_out(patient), deleted=deleted)


@router.get("/patients/{patient_id}/consents", response_model=list[ConsentOut])
def list_consents(patient_id: int, caregiver: CurrentCaregiver, db: DbSession) -> list[ConsentOut]:
    _elder(db, caregiver, patient_id)
    return [ConsentOut.model_validate(c) for c in consent.for_patient(db, patient_id)]


# --- the elder's own photo -----------------------------------------------------------------


@router.post("/patients/{patient_id}/photo", response_model=PatientOut)
async def upload_elder_photo(patient_id: int, request: Request, caregiver: CurrentCaregiver, db: DbSession) -> PatientOut:
    """The request body is the image (JPG or PNG). Needs the photos opt-in. Database and image
    work run off the event loop (app/uploads.py)."""
    patient = await blocking(_elder, db, caregiver, patient_id)
    if content_type(request) not in PHOTO_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only JPG and PNG photos are allowed.")
    data = await read_body(request, family.MAX_PHOTO_BYTES, "Photos must be 5 MB or smaller.")
    return await blocking(_set_elder_photo, db, patient, data)


def _set_elder_photo(db: DbSession, patient: User, data: bytes) -> PatientOut:
    try:
        elders.set_photo(db, patient, data)
    except elders.PhotosOffError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Turn on photos for this person first.")
    except family.PhotoError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return patient_out(patient)


@router.get("/patients/{patient_id}/photo", response_class=Response)
def get_elder_photo(patient_id: int, user: CurrentUser, db: DbSession) -> Response:
    ensure_patient_access(db, user, patient_id)
    patient = db.get(User, patient_id)
    data = elders.photo(db, patient) if patient is not None else None
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No photo")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


@router.delete("/patients/{patient_id}/photo", response_model=PatientOut)
def delete_elder_photo(patient_id: int, caregiver: CurrentCaregiver, db: DbSession) -> PatientOut:
    patient = _elder(db, caregiver, patient_id)
    elders.remove_photo(db, patient)
    return patient_out(patient)


# --- paired devices ------------------------------------------------------------------------


@router.get("/patients/{patient_id}/devices", response_model=list[DeviceOut])
def list_devices(patient_id: int, caregiver: CurrentCaregiver, db: DbSession) -> list[DeviceOut]:
    _elder(db, caregiver, patient_id)
    return [DeviceOut.model_validate(d) for d in devices.for_patient(db, patient_id)]


@router.post("/patients/{patient_id}/devices/{device_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(patient_id: int, device_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> Response:
    _elder(db, caregiver, patient_id)
    if not devices.revoke(db, patient_id, device_id, now):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/patients/{patient_id}/devices/sign-out-all", status_code=status.HTTP_204_NO_CONTENT)
def sign_out_all_devices(patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> Response:
    """Signs out every device of this elder, including ones paired before device sessions existed."""
    patient = _elder(db, caregiver, patient_id)
    for d in devices.for_patient(db, patient_id):
        d.revoked_at = now
    auth.sign_out_everywhere(db, patient)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- family share links --------------------------------------------------------------------


@router.post("/patients/{patient_id}/shares", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
def create_share(patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> LinkOut:
    """A single-use link for a second family member to join this elder (valid 14 days)."""
    patient = _elder(db, caregiver, patient_id)
    link = invites.create_share(db, caregiver, patient, now)
    return LinkOut(id=link.id, token=link.token, expires_at=link.expires_at)


@router.get("/patients/{patient_id}/shares", response_model=list[ShareOut])
def list_shares(patient_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> list[ShareOut]:
    _elder(db, caregiver, patient_id)
    return [
        ShareOut(id=s.id, created_at=s.created_at, expires_at=s.expires_at,
                 state=invites.invite_state(s.expires_at, s.used_at, s.revoked_at, now))  # type: ignore[arg-type]
        for s in invites.shares_for(db, patient_id)
    ]


@router.post("/patients/{patient_id}/shares/{share_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_share(patient_id: int, share_id: int, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> Response:
    _elder(db, caregiver, patient_id)
    if not invites.revoke_share(db, patient_id, share_id, now):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found or already used")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/shares/accept", response_model=PatientOut)
def accept_share(body: ShareAcceptIn, caregiver: CurrentCaregiver, db: DbSession, now: Now) -> PatientOut:
    """A signed-in family member accepts a share link and joins the elder."""
    share = invites.find_share(db, body.token, now)
    if share is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This link is not valid any more.")
    return patient_out(invites.accept_share(db, share, caregiver, now))
