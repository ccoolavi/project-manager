"""Shared helper for creating in-app notifications. Kept separate from the
notifications router so tasks.py, comments.py and organizations.py can create
rows without importing each other."""

from sqlalchemy.orm import Session

from models import Notification


def notify(
    db: Session,
    user_id: int,
    org_id: int,
    type: str,
    title: str,
    message: str,
    entity_type: str = None,
    entity_id: int = None,
) -> None:
    db.add(
        Notification(
            user_id=user_id,
            org_id=org_id,
            type=type,
            title=title,
            message=message,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    )
    db.commit()
