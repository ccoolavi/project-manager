"""Cross-org, per-user endpoints — aggregate across every org the caller
belongs to, rather than being scoped to one org_id from the URL/JWT."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import MyOrgResponse
from models import Organization, OrganizationMember
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/orgs", response_model=List[MyOrgResponse])
async def my_orgs(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every org the caller belongs to, with their role and that org's
    member count — for the My Organizations hub."""
    user_id = int(current_user.get("sub"))
    memberships = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .all()
    )
    result = []
    for m in memberships:
        org = db.query(Organization).filter(Organization.id == m.organization_id).first()
        count = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == m.organization_id
        ).count()
        result.append(MyOrgResponse(
            id=org.id, name=org.name, description=org.description,
            role=m.role, member_count=count,
        ))
    return result
