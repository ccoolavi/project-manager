from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta

from database import get_db
from schemas import UserLogin, UserRegister, TokenResponse, UserResponse
from models import TrustedDevice, User
from utils.security import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token
)
from utils.email import send_email
from utils.email_otp import CODE_TTL_MINUTES, is_rate_limited, issue_code
from config import settings
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""

    # Validate passwords match
    if user_data.password != user_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    # Create new user
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hash_password(user_data.password),
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Creating the account is itself proof of control over this device, so it
    # is trusted immediately — the very next login should not have to clear an
    # email-OTP challenge for a device it was just created on.
    if user_data.device_id:
        db.add(TrustedDevice(user_id=new_user.id, device_id=user_data.device_id))
        db.commit()

    # Create tokens (without org_id yet, user must create/join org first)
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(new_user.id), "email": new_user.email}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(new_user.id), "email": new_user.email}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.from_orm(new_user)
    )

@router.post("/login")
async def login(
    credentials: UserLogin,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Login with an email address or phone number, and a password.

    A device the account has never signed in from before must clear an
    email-OTP challenge; the endpoint then returns ``{otp_required: true}``
    instead of tokens, and the client completes the login via
    ``POST /api/auth/otp/email/verify-login``. Two situations skip this
    entirely: the account has no email on file (there is nothing to send a
    code to), or the caller sent no ``device_id`` at all — the CLI and other
    non-browser API clients never send one, and gating those on a UI-driven
    email challenge would make automation impossible rather than more secure.
    """
    identifier = credentials.identifier.strip()
    user = (
        db.query(User)
        .filter((User.email == identifier) | (User.phone == identifier))
        .first()
    )
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    device_id = credentials.device_id

    if device_id and user.email:
        trusted = (
            db.query(TrustedDevice)
            .filter(TrustedDevice.user_id == user.id, TrustedDevice.device_id == device_id)
            .first()
        )
        if trusted:
            trusted.last_seen_at = datetime.utcnow()
            db.commit()
        else:
            if is_rate_limited(db, user.id, "login_device"):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many codes requested. Please wait a few minutes and try again.",
                )
            # The code exists in the database the instant it's issued; only
            # the SMTP round trip (which can take several seconds) is pushed
            # to the background, so the OTP-entry screen appears immediately
            # instead of leaving the user staring at a spinner.
            code = issue_code(db, user.id, "login_device")
            background_tasks.add_task(
                send_email,
                user.email,
                "KaizenPM sign-in code",
                f"Someone is signing in to KaizenPM from a new device.\n\n"
                f"Your code is {code}. It expires in {CODE_TTL_MINUTES} minutes.\n\n"
                "If this was not you, change your password.",
            )
            return {
                "otp_required": True,
                "reason": "new_device",
                "message": "We're emailing you a code to confirm this new device.",
            }
    elif device_id:
        # No email on file — nothing to challenge with, so just record the
        # device for consistency; it plays no further role until an email
        # exists.
        existing = (
            db.query(TrustedDevice)
            .filter(TrustedDevice.user_id == user.id, TrustedDevice.device_id == device_id)
            .first()
        )
        if not existing:
            db.add(TrustedDevice(user_id=user.id, device_id=device_id))
            db.commit()

    # Get user's first organization (if any)
    org = None
    if user.memberships:
        org = user.memberships[0].organization

    # Create tokens with org_id and role
    token_data = {
        "sub": str(user.id),
        "email": user.email,
    }
    if org:
        user_role = user.memberships[0].role.value
        token_data.update({
            "org_id": org.id,
            "role": user_role,
            "permissions": get_permissions_for_role(user_role)
        })

    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.from_orm(user)
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    org_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-issue a token, optionally scoped to a specific organization.

    The client calls this after creating an organization (the sign-up token has no
    org claims yet) and after switching organizations, so that ``org_id``, ``role``
    and ``permissions`` always describe the organization actually being viewed.
    Without the ``org_id`` argument the token would always describe the user's
    first membership, which silently breaks multi-org role handling.
    """

    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user"
        )

    membership = None
    if org_id is not None:
        membership = next(
            (m for m in user.memberships if m.organization_id == org_id), None
        )
        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of that organization",
            )
    elif user.memberships:
        membership = user.memberships[0]

    token_data = {
        "sub": str(user.id),
        "email": user.email,
    }
    if membership:
        user_role = membership.role.value
        token_data.update({
            "org_id": membership.organization_id,
            "role": user_role,
            "permissions": get_permissions_for_role(user_role)
        })

    access_token = create_access_token(token_data)
    refresh_token_new = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_new,
        user=UserResponse.from_orm(user)
    )

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout user (client-side token deletion)"""
    return {"message": "Logout successful"}

# Helper function to get permissions for a role
def get_permissions_for_role(role: str) -> list:
    """Get permissions for a role"""
    from utils.security import ROLE_PERMISSIONS
    return ROLE_PERMISSIONS.get(role, [])
