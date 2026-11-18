from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentCaregiver, CurrentUser, DbSession, Now, ensure_patient_access
from app.models import Alert, User
from app.schemas import AlertOut, AlertsAckIn, AlertsAckOut
from app.services import reminders

router = APIRouter(tags=["alerts"])


@router.get("/patients/{patient_id}/alerts", response_model=list[AlertOut])
def list_alerts(patient_id: int, user: CurrentUser, db: DbSession, now: Now) -> list[AlertOut]:
    ensure_patient_access(db, user, patient_id)
    patient = db.get(User, patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    reminders.sweep(db, patient, now)
    rows = db.scalars(select(Alert).where(Alert.patient_id == patient_id).order_by(Alert.created_at.desc(), Alert.id.desc()))
    return [AlertOut.model_validate(a) for a in rows]


@router.post("/patients/{patient_id}/alerts/ack", response_model=AlertsAckOut)
def acknowledge_alerts(patient_id: int, body: AlertsAckIn, caregiver: CurrentCaregiver, db: DbSession) -> AlertsAckOut:
    """Acknowledge a group of alerts ("Acknowledge" on a grouped card) or, with no ids, every new
    alert for this patient ("Acknowledge all"). Ids of other patients' alerts are refused."""
    ensure_patient_access(db, caregiver, patient_id)
    stmt = select(Alert).where(Alert.patient_id == patient_id, Alert.acknowledged.is_(False))
    if body.ids is not None:
        found = set(db.scalars(select(Alert.id).where(Alert.id.in_(body.ids), Alert.patient_id == patient_id)))
        if found != set(body.ids):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
        stmt = stmt.where(Alert.id.in_(body.ids))
    alerts = list(db.scalars(stmt))
    for alert in alerts:
        alert.acknowledged = True
    db.commit()
    return AlertsAckOut(acknowledged=len(alerts))


@router.post("/alerts/{alert_id}/ack", response_model=AlertOut)
def acknowledge_alert(alert_id: int, caregiver: CurrentCaregiver, db: DbSession) -> AlertOut:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    ensure_patient_access(db, caregiver, alert.patient_id)
    alert.acknowledged = True
    db.commit()
    return AlertOut.model_validate(alert)
