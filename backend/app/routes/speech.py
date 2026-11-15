from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.deps import CurrentPatient, CurrentUser, DbSession, Now, ensure_patient_access
from app.models import SpeechSample
from app.schemas import SpeechSampleOut
from app.services import speech

router = APIRouter(tags=["speech"])


def _out(sample: SpeechSample) -> SpeechSampleOut:
    return SpeechSampleOut(
        id=sample.id,
        recorded_at=sample.recorded_at,
        duration_ms=sample.duration_ms,
        transcript=sample.transcript,
        risk_score=sample.risk_score,
        model_version=sample.model_version,
        audio_url=f"/patients/{sample.patient_id}/speech/{sample.id}/audio",
    )


@router.post("/speech", response_model=SpeechSampleOut, status_code=status.HTTP_201_CREATED)
async def upload_recording(
    request: Request,
    patient: CurrentPatient,
    db: DbSession,
    now: Now,
    duration_ms: Annotated[int, Query(gt=0)],
) -> SpeechSampleOut:
    """The request body is the recording itself (Content-Type audio/webm or audio/ogg)."""
    if not patient.voice_task_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The voice task is not turned on.")
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in speech.AUDIO_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Recordings must be WebM or Ogg audio.")
    if duration_ms > speech.max_duration_ms():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The recording length is not valid.")
    limit = speech.max_audio_bytes()
    too_big = HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=speech.too_big_message())
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise too_big

    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise too_big
    try:
        sample = speech.save_recording(db, patient, bytes(data), content_type, duration_ms, now)
    except speech.AudioError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return _out(sample)


@router.get("/patients/{patient_id}/speech", response_model=list[SpeechSampleOut])
def list_recordings(patient_id: int, user: CurrentUser, db: DbSession) -> list[SpeechSampleOut]:
    ensure_patient_access(db, user, patient_id)
    return [_out(s) for s in speech.samples_for(db, patient_id)]


@router.get("/patients/{patient_id}/speech/{sample_id}/audio", response_class=Response)
def get_recording(patient_id: int, sample_id: int, user: CurrentUser, db: DbSession) -> Response:
    """Private recording: only the patient and their linked caregivers may fetch it."""
    ensure_patient_access(db, user, patient_id)
    sample = db.get(SpeechSample, sample_id)
    data = speech.audio_data(db, sample) if sample is not None and sample.patient_id == patient_id else None
    if sample is None or data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return Response(
        data,
        media_type=sample.content_type,
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
