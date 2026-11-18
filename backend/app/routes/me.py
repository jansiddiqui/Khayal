from fastapi import APIRouter, HTTPException, Response, status

from app.deps import CurrentCaregiver, CurrentPatient, DbSession, Now
from app.schemas import ConsentOut, DeleteAccountIn, RemovedOut, VoiceCheckIn
from app.services import accounts, auth, consent, export

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/consents", response_model=list[ConsentOut])
def my_consents(caregiver: CurrentCaregiver, db: DbSession) -> list[ConsentOut]:
    return [ConsentOut.model_validate(c) for c in consent.for_user(db, caregiver)]


@router.get("/export", response_class=Response)
def export_my_data(caregiver: CurrentCaregiver, db: DbSession, now: Now) -> Response:
    """Everything Khayal holds about you and the elders you look after: JSON plus photos and recordings, as a zip."""
    data = export.build(db, caregiver, now)
    name = f"khayal-export-{now.strftime('%Y-%m-%d')}.zip"
    return Response(
        data, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"},
    )


@router.post("/voice-check", status_code=status.HTTP_204_NO_CONTENT)
def report_voice(body: VoiceCheckIn, patient: CurrentPatient, db: DbSession, now: Now) -> Response:
    """The elder's device reports which read-aloud voice it found for the app language, so the
    family can see when Urdu falls back to a Hindi voice or no voice exists (Round 2 batch 5)."""
    patient.voice_check = {"lang": body.lang, "voice": body.voice, "using": body.using, "checked_at": now.isoformat()}
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/delete", response_model=RemovedOut)
def delete_my_account(body: DeleteAccountIn, caregiver: CurrentCaregiver, db: DbSession) -> RemovedOut:
    """Type DELETE and your password: removes you, and every elder no other family member looks after,
    with all their data and files. This cannot be undone."""
    if not auth.verify_password(body.password, caregiver.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The password is not right")
    return RemovedOut(removed=len(accounts.delete_account(db, caregiver)))
