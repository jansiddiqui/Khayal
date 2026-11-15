from fastapi import APIRouter, Depends, status

from app.deps import DbSession, Now, rate_limit
from app.schemas import InviteRequestIn, InviteRequestOut
from app.services import invites

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post(
    "", response_model=InviteRequestOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("invite"))]
)
def request_invite(body: InviteRequestIn, db: DbSession, now: Now) -> InviteRequestOut:
    """Public: ask for an invite to the pilot. The same answer whether or not it was stored,
    so the form never tells a bot (or anyone) more than "thank you"."""
    invites.submit(db, body, now)
    return InviteRequestOut()
