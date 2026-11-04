from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentCaregiver, DbSession
from app.schemas import LinkPatientIn, PatientOut
from app.services import auth, care

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientOut])
def list_patients(caregiver: CurrentCaregiver, db: DbSession) -> list[PatientOut]:
    return [PatientOut.model_validate(p) for p in care.linked_patients(db, caregiver)]


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
