from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from datetime import timedelta

from database import get_db
from schemas import UserLogin, UserRegister, TokenResponse, UserResponse
from models import User
from utils.security import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_token
)
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

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login with email and password"""

    # Find user
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

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
