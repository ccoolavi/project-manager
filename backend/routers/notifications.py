from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from middleware.auth import get_current_user
from models import Notification
from schemas import NotificationResponse

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

LIST_LIMIT = 50


@router.get("", response_model=List[NotificationResponse])
async def list_notifications(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unread notifications for the caller, newest first."""
    user_id = int(current_user.get("sub"))
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .order_by(Notification.created_at.desc())
        .limit(LIST_LIMIT)
        .all()
    )
    return [NotificationResponse.from_orm(n) for n in notifications]


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.read_at = datetime.utcnow()
    db.commit()
    return {"message": "Marked read"}


@router.post("/read-all")
async def mark_all_read(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    db.query(Notification).filter(
        Notification.user_id == user_id, Notification.read_at.is_(None)
    ).update({"read_at": datetime.utcnow()})
    db.commit()
    return {"message": "All notifications marked read"}
