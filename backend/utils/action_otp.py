"""Guard for sensitive actions: re-verify with an emailed code before a
destructive request completes, independent of how recently the user logged in.

The "recently verified" window is tracked in a plain in-process dict. That is
safe because the API runs as a single uvicorn worker (see
kaizenpm-api.service) — there is only ever one process to hold it — and losing
the window on a restart is harmless: the next sensitive action simply asks for
a fresh code.
"""

from datetime import datetime, timedelta
from typing import Dict

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user
from models import User

ACTION_OTP_TTL_MINUTES = 5

_verified_until: Dict[int, datetime] = {}


def mark_verified(user_id: int) -> None:
    _verified_until[user_id] = datetime.utcnow() + timedelta(minutes=ACTION_OTP_TTL_MINUTES)


def is_recently_verified(user_id: int) -> bool:
    until = _verified_until.get(user_id)
    return bool(until and until > datetime.utcnow())


async def require_recent_action_otp(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dependency for destructive endpoints.

    Skipped entirely when the account has no email on file — there is then no
    way to challenge the user, the same rule applied to the new-device login
    challenge, so a phone-only or email-less account is never locked out of
    its own data.
    """
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.email:
        return
    if not is_recently_verified(user_id):
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="Please verify with the code we emailed you, then try again.",
        )
