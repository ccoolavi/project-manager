from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.security import decode_token
from typing import Optional, Dict

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """Extract and validate JWT from Authorization header"""
    token = credentials.credentials

    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload

async def get_current_org_id(current_user: Dict = Depends(get_current_user)) -> int:
    """Get current organization ID from JWT"""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No organization selected",
        )
    return org_id

async def get_current_role(current_user: Dict = Depends(get_current_user)) -> str:
    """Get current user's role from JWT"""
    role = current_user.get("role")
    if not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No role assigned",
        )
    return role

async def get_current_permissions(current_user: Dict = Depends(get_current_user)) -> list:
    """Get current user's permissions from JWT"""
    return current_user.get("permissions", [])

def require_permission(required_permission: str):
    """Dependency to check if user has a specific permission"""
    async def permission_checker(permissions: list = Depends(get_current_permissions)):
        # Check exact permission
        if required_permission in permissions:
            return True

        # Check wildcard permissions (e.g., "project:*")
        base_permission = required_permission.split(":")[0]
        if f"{base_permission}:*" in permissions:
            return True

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission '{required_permission}' required",
        )

    return permission_checker

def require_org_role(*allowed_roles):
    """Dependency to check if user has a specific org role"""
    async def role_checker(current_user: Dict = Depends(get_current_user)):
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' not allowed. Required: {allowed_roles}",
            )
        return current_user

    return role_checker
