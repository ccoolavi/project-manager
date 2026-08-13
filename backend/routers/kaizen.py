from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import KaizenLogCreate, KaizenLogUpdate, KaizenLogResponse
from models import KaizenLog
from middleware.auth import get_current_user
from utils.tenancy import require_membership

router = APIRouter(prefix="/api/orgs/{org_id}/kaizen", tags=["kaizen"])


@router.post("", response_model=KaizenLogResponse)
async def create_kaizen_log(
    org_id: int,
    log_data: KaizenLogCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log a continuous-improvement entry."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    new_log = KaizenLog(
        organization_id=org_id,
        user_id=user_id,
        title=log_data.title,
        problem=log_data.problem,
        solution=log_data.solution,
        category=log_data.category,
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    return KaizenLogResponse.from_orm(new_log)


@router.get("", response_model=List[KaizenLogResponse])
async def list_kaizen_logs(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the caller's improvement logs in this organization.

    Kaizen entries are personal, matching the requirement that a user sees only
    their own personal-productivity data.
    """
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    logs = (
        db.query(KaizenLog)
        .filter(KaizenLog.organization_id == org_id, KaizenLog.user_id == user_id)
        .order_by(KaizenLog.created_at.desc())
        .all()
    )
    return [KaizenLogResponse.from_orm(log) for log in logs]


def _get_own_log(db: Session, org_id: int, user_id: int, log_id: int) -> KaizenLog:
    log = (
        db.query(KaizenLog)
        .filter(
            KaizenLog.id == log_id,
            KaizenLog.organization_id == org_id,
            KaizenLog.user_id == user_id,
        )
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Kaizen log not found")
    return log


@router.put("/{log_id}", response_model=KaizenLogResponse)
async def update_kaizen_log(
    org_id: int,
    log_id: int,
    log_data: KaizenLogUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an improvement log."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    log = _get_own_log(db, org_id, user_id, log_id)

    for field in ("title", "problem", "solution", "category", "status"):
        value = getattr(log_data, field, None)
        if value is not None:
            setattr(log, field, value)

    db.commit()
    db.refresh(log)

    return KaizenLogResponse.from_orm(log)


@router.delete("/{log_id}")
async def delete_kaizen_log(
    org_id: int,
    log_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an improvement log."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    log = _get_own_log(db, org_id, user_id, log_id)

    db.delete(log)
    db.commit()

    return {"message": "Kaizen log deleted"}
