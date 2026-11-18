"""Send feedback (any signed-in caregiver or patient) and the admin feedback inbox (Round 2 batch 3)."""

import math
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from app.deps import CurrentAdmin, CurrentPatient, CurrentUser, DbSession, Now
from app.models import CareLink, Feedback, FeedbackKind, FeedbackStatus, Role, User
from app.schemas import AdminFeedbackOut, FeedbackIn, FeedbackSentOut, FeedbackStatusIn
from app.services import admin_log, feedback, ratelimit, storage
from app.uploads import blocking, content_type, read_body

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackSentOut, status_code=status.HTTP_201_CREATED)
def send_feedback(body: FeedbackIn, user: CurrentUser, db: DbSession, now: Now) -> FeedbackSentOut:
    wait = ratelimit.LIMITS["feedback"].hit(str(user.id), now)
    if wait is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Thank you, we have your messages. Please try again a little later.",
            headers={"Retry-After": str(math.ceil(wait))},
        )
    item = feedback.create(db, user, FeedbackKind(body.kind), body.text, body.page, now)
    return FeedbackSentOut(id=item.id)


@router.post("/feedback/{feedback_id}/voice", status_code=status.HTTP_204_NO_CONTENT)
async def add_voice_note(feedback_id: int, request: Request, patient: CurrentPatient, db: DbSession, now: Now) -> Response:
    """The request body is the voice note (WebM or Ogg). Patients with the voice opt-in only."""
    item = feedback.mine(db, patient, feedback_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    if not patient.voice_task_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Voice notes need the voice opt-in.")
    data = await read_body(request, feedback.MAX_NOTE_BYTES, "That voice note is too long.")
    try:
        await blocking(feedback.attach_voice, db, item, patient, data, content_type(request), now)
    except feedback.AudioError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _sender(db: DbSession, item: Feedback) -> str | None:
    if item.user_id is None:
        return None
    user = db.get(User, item.user_id)
    if user is None:
        return None
    if user.role == Role.caregiver:
        return f"{user.name} <{user.email}>" if user.email else user.name
    family = [
        c.name
        for c in db.scalars(select(User).join(CareLink, CareLink.caregiver_id == User.id).where(CareLink.patient_id == user.id))
    ]
    return f"{user.name} (elder" + (f" of {', '.join(family)})" if family else ")")


def _out(db: DbSession, item: Feedback) -> AdminFeedbackOut:
    return AdminFeedbackOut(
        id=item.id,
        role=item.role,
        kind=item.kind.value,  # type: ignore[arg-type]
        text=item.text,
        page=item.page,
        has_voice=item.audio_key is not None,
        status=item.status.value,  # type: ignore[arg-type]
        created_at=item.created_at,
        sender=_sender(db, item),
    )


@router.get("/admin/feedback", response_model=list[AdminFeedbackOut])
def list_feedback(
    admin: CurrentAdmin, db: DbSession, state: Annotated[FeedbackStatus | None, Query(alias="status")] = None
) -> list[AdminFeedbackOut]:
    return [_out(db, f) for f in feedback.inbox(db, state)]


def _item(db: DbSession, feedback_id: int) -> Feedback:
    item = db.get(Feedback, feedback_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    return item


@router.post("/admin/feedback/{feedback_id}/status", response_model=AdminFeedbackOut)
def set_feedback_status(feedback_id: int, body: FeedbackStatusIn, admin: CurrentAdmin, db: DbSession, now: Now) -> AdminFeedbackOut:
    item = _item(db, feedback_id)
    admin_log.record(db, admin, "feedback_status", f"Feedback #{item.id} marked {body.status}", now)
    return _out(db, feedback.set_status(db, item, FeedbackStatus(body.status), now))


@router.get("/admin/feedback/{feedback_id}/voice", response_class=Response)
def get_voice_note(feedback_id: int, admin: CurrentAdmin, db: DbSession) -> Response:
    item = _item(db, feedback_id)
    data = storage.get().load(db, item.audio_key) if item.audio_key else None
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No voice note")
    return Response(content=data, media_type=item.audio_type or "audio/webm", headers={"Cache-Control": "private, no-store"})
