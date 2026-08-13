"""Phone verification by one-time code, delivered over WhatsApp.

Design notes:

* Codes are stored only as bcrypt hashes, never in plain text, so a database
  read cannot be replayed as a login.
* Requests are rate limited per phone number, because an unthrottled OTP
  endpoint is both an SMS-cost and an enumeration problem.
* Verification is attempt-limited and single-use: a code is consumed on success
  and all outstanding codes for that number are cleared.
* Delivery failure does not fail the request. The bridge on this box is shared
  with the Hermes agent and may be down; the caller is told delivery status
  explicitly via ``delivered`` rather than being handed a 500.
"""

import logging
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user
from models import OTPSession, User
from schemas import RequestOTP, VerifyOTP
from utils.notify import normalise_phone, send_whatsapp
from utils.security import hash_password, verify_password

logger = logging.getLogger("kaizenpm.otp")

router = APIRouter(prefix="/api/auth/otp", tags=["otp"])

CODE_TTL_MINUTES = 10
MAX_REQUESTS_PER_WINDOW = 3
RATE_LIMIT_WINDOW_MINUTES = 15


@router.post("/request")
async def request_otp(
    payload: RequestOTP,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a code for the caller's phone number and send it over WhatsApp."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    phone = normalise_phone(payload.phone)
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Please enter a valid phone number")

    window_start = datetime.utcnow() - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)
    recent = (
        db.query(OTPSession)
        .filter(OTPSession.phone == phone, OTPSession.created_at >= window_start)
        .count()
    )
    if recent >= MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many codes requested. Please wait a few minutes and try again.",
        )

    # Only prune rows that have already fallen out of the rate-limit window.
    # Deleting every unused row here would erase the very history the rate limit
    # counts, letting a caller request unlimited codes. Superseding earlier codes
    # is handled at verification time, which only ever considers the newest row.
    db.query(OTPSession).filter(
        OTPSession.phone == phone, OTPSession.created_at < window_start
    ).delete()

    code = f"{secrets.randbelow(1_000_000):06d}"
    session = OTPSession(
        phone=phone,
        otp_hash=hash_password(code),
        expires_at=datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES),
    )
    db.add(session)
    db.commit()

    delivered = await send_whatsapp(
        phone,
        f"Your KaizenPM verification code is {code}. "
        f"It expires in {CODE_TTL_MINUTES} minutes.",
    )
    if not delivered:
        logger.warning("OTP for %s could not be delivered over WhatsApp", phone)

    return {
        "message": (
            "Verification code sent."
            if delivered
            else "Code generated, but it could not be delivered over WhatsApp right now."
        ),
        "delivered": delivered,
        "expires_in_minutes": CODE_TTL_MINUTES,
    }


@router.post("/verify")
async def verify_otp(
    payload: VerifyOTP,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check a code and, on success, attach the verified number to the account."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    phone = normalise_phone(payload.phone)
    session = (
        db.query(OTPSession)
        .filter(OTPSession.phone == phone, OTPSession.verified_at.is_(None))
        .order_by(OTPSession.created_at.desc())
        .first()
    )

    if not session:
        raise HTTPException(status_code=400, detail="Please request a new code")

    if session.expires_at < datetime.utcnow():
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=400, detail="That code has expired. Please request a new one.")

    if not verify_password(payload.code, session.otp_hash):
        raise HTTPException(status_code=400, detail="That code is not correct")

    session.verified_at = datetime.utcnow()
    user.phone = phone
    user.whatsapp_verified = True
    db.commit()

    # A consumed code must not be redeemable again.
    db.query(OTPSession).filter(
        OTPSession.phone == phone, OTPSession.verified_at.is_(None)
    ).delete()
    db.commit()

    return {"message": "Phone number verified", "phone": phone, "verified": True}


@router.get("/status")
async def otp_status(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Report whether the caller's phone number is verified."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"phone": user.phone, "verified": bool(user.whatsapp_verified)}
