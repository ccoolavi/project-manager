from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import TimeEntryCreate, TimeEntryResponse
from models import TimeEntry
from middleware.auth import get_current_user
from utils.tenancy import require_membership

router = APIRouter(prefix="/api/orgs/{org_id}/time", tags=["time"])


@router.post("", response_model=TimeEntryResponse)
async def create_time_entry(
    org_id: int,
    entry_data: TimeEntryCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log a block of time."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    if entry_data.duration_minutes <= 0:
        raise HTTPException(status_code=400, detail="Duration must be greater than zero")

    new_entry = TimeEntry(
        organization_id=org_id,
        user_id=user_id,
        task_id=entry_data.task_id,
        duration_minutes=entry_data.duration_minutes,
        category=entry_data.category,
        date=entry_data.date or datetime.utcnow(),
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    return TimeEntryResponse.from_orm(new_entry)


@router.get("", response_model=List[TimeEntryResponse])
async def list_time_entries(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the caller's own time entries in this organization."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    entries = (
        db.query(TimeEntry)
        .filter(TimeEntry.organization_id == org_id, TimeEntry.user_id == user_id)
        .order_by(TimeEntry.date.desc())
        .all()
    )
    return [TimeEntryResponse.from_orm(entry) for entry in entries]


@router.delete("/{entry_id}")
async def delete_time_entry(
    org_id: int,
    entry_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete one of the caller's time entries."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    entry = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.id == entry_id,
            TimeEntry.organization_id == org_id,
            TimeEntry.user_id == user_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")

    db.delete(entry)
    db.commit()

    return {"message": "Time entry deleted"}
