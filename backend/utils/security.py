from datetime import datetime, timedelta
from typing import Optional, Dict, List
from passlib.context import CryptContext
from jose import JWTError, jwt
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None

# Permission matrix
ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "owner": [
        "org:manage_members",
        "org:delete",
        "org:manage_settings",
        "project:create",
        "project:edit",
        "project:delete",
        "task:create",
        "task:edit",
        "task:delete",
        "task:assign",
    ],
    "admin": [
        "org:manage_members",
        "project:create",
        "project:edit",
        "project:delete",
        "task:create",
        "task:edit",
        "task:delete",
        "task:assign",
    ],
    "editor": [
        "project:edit",
        "task:create",
        "task:edit",
        "task:assign",
    ],
    "viewer": [
        "project:view",
        "task:view",
    ],
    "member": [
        "project:view",
        "task:view",
        "task:create",
    ],
}

def get_permissions_for_role(role: str) -> List[str]:
    """Get all permissions for a given role"""
    return ROLE_PERMISSIONS.get(role, [])

def check_permission(role: str, required_permission: str) -> bool:
    """Check if a role has a specific permission"""
    permissions = get_permissions_for_role(role)

    # Handle wildcard permissions (e.g., "project:*")
    if f"{required_permission.split(':')[0]}:*" in permissions:
        return True

    return required_permission in permissions
