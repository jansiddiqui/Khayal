from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentCaregiver, DbSession, Now, ensure_patient_access
from app.models import User
from app.schemas import LinkPatientIn, PatientOut, PatientSummaryOut, PatientUpdateIn
from app.services import auth, care, decline

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientSummaryOut])
def list_patients(caregiver: CurrentCaregiver, db: DbSession, now: Now) -> list[PatientSummaryOut]:
    out: list[PatientSummaryOut] = []
    for p in care.linked_patients(db, caregiver):
        result = decline.overview(db, p.id, until=now)
        out.append(
            PatientSummaryOut(
                **PatientOut.model_validate(p).model_dump(),
                cognitive_index=result.index,
                cognitive_status=result.status,
            )
        )
    return out


@router.post("/link", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def link_patient(body: LinkPatientIn, caregiver: CurrentCaregiver, db: DbSession) -> PatientOut:
    patient = auth.get_user_by_email(db, body.patient_email)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No patient with that email")
    try:
        care.link_patient(db, caregiver, patient)
    except care.NotAPatientError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That account is not a patient")
    return PatientOut.model_validate(patient)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: int, body: PatientUpdateIn, caregiver: CurrentCaregiver, db: DbSession) -> PatientOut:
    ensure_patient_access(db, caregiver, patient_id)
    patient = db.get(User, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if "city" in body.model_fields_set:
        patient.city = body.city or None
    if "pinned_games" in body.model_fields_set:
        patient.pinned_games = [g.value for g in body.pinned_games] if body.pinned_games else None
    db.commit()
    return PatientOut.model_validate(patient)
