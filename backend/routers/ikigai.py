from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user
from models import Ikigai
from schemas import IkigaiResponse, IkigaiUpdate
from utils.tenancy import require_membership

router = APIRouter(prefix="/api/orgs/{org_id}/ikigai", tags=["ikigai"])


def _get_or_create(db: Session, org_id: int, user_id: int) -> Ikigai:
    record = (
        db.query(Ikigai)
        .filter(Ikigai.organization_id == org_id, Ikigai.user_id == user_id)
        .first()
    )
    if not record:
        record = Ikigai(organization_id=org_id, user_id=user_id)
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


@router.get("", response_model=IkigaiResponse)
async def get_ikigai(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Read the caller's own ikigai. Always personal, never shared."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    return IkigaiResponse.from_orm(_get_or_create(db, org_id, user_id))


@router.put("", response_model=IkigaiResponse)
async def update_ikigai(
    org_id: int,
    payload: IkigaiUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update any subset of the four questions and the purpose statement."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    record = _get_or_create(db, org_id, user_id)

    for field in ("love", "good_at", "world_needs", "paid_for", "purpose"):
        value = getattr(payload, field, None)
        if value is not None:
            setattr(record, field, value)

    db.commit()
    db.refresh(record)
    return IkigaiResponse.from_orm(record)
