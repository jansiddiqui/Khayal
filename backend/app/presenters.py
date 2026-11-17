"""Turning models into API output where a field is computed (admin, has a photo)."""

from app.models import User
from app.schemas import PatientOut, UserOut
from app.services import auth, core_games


def user_out(user: User) -> UserOut:
    return UserOut.model_validate(user).model_copy(update={"is_admin": auth.is_admin(user), "has_photo": bool(user.photo_key)})


def patient_out(patient: User) -> PatientOut:
    return PatientOut.model_validate(patient).model_copy(
        update={
            "has_photo": bool(patient.photo_key),
            "core_games": core_games.core_games(patient),
            "core_is_default": not patient.core_games,
        }
    )
