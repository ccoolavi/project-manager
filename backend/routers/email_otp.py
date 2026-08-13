from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user
from models import TrustedDevice, User
from schemas import TokenResponse, UserResponse, VerifyActionOTP, VerifyLoginOTP
from utils.action_otp import mark_verified
from utils.email import send_email
from utils.email_otp import (
    CODE_TTL_MINUTES,
    is_rate_limited,
    issue_code,
    latest_unverified,
)
from utils.security import (
    ROLE_PERMISSIONS,
    create_access_token,
    create_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/api/auth/otp/email", tags=["email-otp"])


def _build_tokens(user: User) -> TokenResponse:
    token_data = {"sub": str(user.id), "email": user.email}
    if user.memberships:
        membership = user.memberships[0]
        role = membership.role.value
        token_data.update(
            {
                "org_id": membership.organization_id,
                "role": role,
                "permissions": ROLE_PERMISSIONS.get(role, []),
            }
        )
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserResponse.from_orm(user),
    )


@router.post("/verify-login", response_model=TokenResponse)
async def verify_login_otp(payload: VerifyLoginOTP, db: Session = Depends(get_db)):
    """Complete a login that /api/auth/login held for a new-device challenge."""
    identifier = payload.identifier.strip()
    user = (
        db.query(User)
        .filter((User.email == identifier) | (User.phone == identifier))
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    otp = latest_unverified(db, user.id, "login_device")
    if not otp:
        raise HTTPException(status_code=400, detail="Please request a new code by logging in again")
    if otp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="That code has expired. Please log in again.")
    if not verify_password(payload.code, otp.otp_hash):
        raise HTTPException(status_code=400, detail="That code is not correct")

    otp.verified_at = datetime.utcnow()
    if payload.device_id:
        db.add(TrustedDevice(user_id=user.id, device_id=payload.device_id))
    db.commit()

    return _build_tokens(user)


@router.post("/request-action")
async def request_action_otp(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ask for a fresh code before a sensitive action.

    Tells the client to proceed without a code when the account has no email
    on file — there is nothing to send the code to.

    The code is generated and stored before responding, so it is valid the
    instant the client sees this response; only the SMTP round trip itself
    (which can take several seconds) is pushed to a background task, so the
    caller — in practice, a modal the user is staring at — doesn't have to
    wait on it.
    """
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.email:
        return {"required": False, "message": "No email on file; you can proceed."}

    if is_rate_limited(db, user.id, "sensitive_action"):
        raise HTTPException(
            status_code=429,
            detail="Too many codes requested. Please wait a few minutes and try again.",
        )

    code = issue_code(db, user.id, "sensitive_action")
    background_tasks.add_task(
        send_email,
        user.email,
        "KaizenPM verification code",
        f"Your verification code is {code}. It expires in {CODE_TTL_MINUTES} minutes.\n\n"
        "If you did not request this, you can ignore this email.",
    )
    return {"required": True, "message": "We're emailing you a code now."}


@router.post("/verify-action")
async def verify_action_otp(
    payload: VerifyActionOTP,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Redeem a sensitive-action code, opening a short window to complete it."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = latest_unverified(db, user.id, "sensitive_action")
    if not otp:
        raise HTTPException(status_code=400, detail="Please request a new code")
    if otp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="That code has expired")
    if not verify_password(payload.code, otp.otp_hash):
        raise HTTPException(status_code=400, detail="That code is not correct")

    otp.verified_at = datetime.utcnow()
    db.commit()

    mark_verified(user.id)
    return {"verified": True}
