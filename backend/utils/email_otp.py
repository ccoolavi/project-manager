"""Shared code-issuing logic for email OTP, used by both the login-device
challenge (in routers/auth.py) and the sensitive-action challenge
(routers/email_otp.py). Kept separate from the routers so neither has to
import the other.
"""

import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models import EmailOTP
from utils.security import hash_password

CODE_TTL_MINUTES = 10
MAX_REQUESTS_PER_WINDOW = 5
RATE_LIMIT_WINDOW_MINUTES = 15


def is_rate_limited(db: Session, user_id: int, purpose: str) -> bool:
    window_start = datetime.utcnow() - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)
    count = (
        db.query(EmailOTP)
        .filter(
            EmailOTP.user_id == user_id,
            EmailOTP.purpose == purpose,
            EmailOTP.created_at >= window_start,
        )
        .count()
    )
    return count >= MAX_REQUESTS_PER_WINDOW


def issue_code(db: Session, user_id: int, purpose: str) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailOTP(
            user_id=user_id,
            purpose=purpose,
            otp_hash=hash_password(code),
            expires_at=datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES),
        )
    )
    db.commit()
    return code


def latest_unverified(db: Session, user_id: int, purpose: str):
    return (
        db.query(EmailOTP)
        .filter(
            EmailOTP.user_id == user_id,
            EmailOTP.purpose == purpose,
            EmailOTP.verified_at.is_(None),
        )
        .order_by(EmailOTP.created_at.desc())
        .first()
    )
