"""Audit trail.

Records who did what, so an organisation owner can answer "who deleted that?"
without reading server logs. Recording is deliberately best-effort: an audit
write must never be the reason a user's action fails.
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog

logger = logging.getLogger("kaizenpm.audit")


def record(
    db: Session,
    org_id: int,
    user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    changes: Optional[dict] = None,
) -> None:
    """Append an entry. Swallows its own errors on purpose."""
    try:
        db.add(
            AuditLog(
                organization_id=org_id,
                user_id=user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                changes=changes,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("could not write audit entry: %s %s", action, entity_type)
        db.rollback()
