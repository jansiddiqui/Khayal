from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import DbSession, Now, rate_limit
from app.schemas import DemoStartOut, PairingCodeOut, UserOut
from app.services import auth, demo

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post(
    "/start", response_model=DemoStartOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("demo"))]
)
def start_demo(db: DbSession, now: Now) -> DemoStartOut:
    """Public demo only: a fresh caregiver with private copies of the three demo patients.
    Signs the visitor in and returns a pairing code for the patient side."""
    try:
        started = demo.start_demo(db, now)
    except demo.DemoModeOffError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    return DemoStartOut(
        access_token=auth.create_access_token(started.caregiver.id),
        user=UserOut.model_validate(started.caregiver),
        patient_id=started.paired_patient.id,
        patient_name=started.paired_patient.name,
        pairing=PairingCodeOut(code=started.code.code, expires_at=started.code.expires_at),
    )
