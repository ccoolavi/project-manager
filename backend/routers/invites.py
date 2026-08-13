"""Invitations addressed to the signed-in user.

An invitation can be sent to someone who does not have an account yet. When they
later sign up, nothing in the organisation-scoped routes can find that invite for
them, because they are not a member of the organisation and so cannot list its
invites. These endpoints close that gap: they are keyed on the caller's own email
address rather than on an organisation they do not yet belong to.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from middleware.auth import get_current_user
from models import InviteStatus, Organization, OrganizationInvite, OrganizationMember, User
from schemas import InviteResponse
from utils.audit import record

router = APIRouter(prefix="/api/invites", tags=["invites"])


@router.get("/mine")
async def my_invites(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List pending, unexpired invitations addressed to the caller."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    invites = (
        db.query(OrganizationInvite)
        .filter(
            OrganizationInvite.email == user.email,
            OrganizationInvite.status == InviteStatus.pending,
        )
        .all()
    )

    result = []
    for inv in invites:
        if inv.expires_at and inv.expires_at < datetime.utcnow():
            continue
        org = db.query(Organization).filter(Organization.id == inv.organization_id).first()
        result.append(
            {
                "id": inv.id,
                "organization_id": inv.organization_id,
                "organization_name": org.name if org else "Unknown",
                "role": inv.role.value if hasattr(inv.role, "value") else inv.role,
                "expires_at": inv.expires_at,
            }
        )
    return result


@router.post("/{invite_id}/accept")
async def accept_invite(
    invite_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Join the organisation this invitation names."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    invite = db.query(OrganizationInvite).filter(OrganizationInvite.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # An invitation is addressed to an email, not to a user id.
    if invite.email.lower() != user.email.lower():
        raise HTTPException(status_code=403, detail="That invitation is for someone else")

    if invite.status != InviteStatus.pending:
        raise HTTPException(status_code=400, detail="That invitation has already been used")

    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="That invitation has expired")

    existing = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == invite.organization_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if not existing:
        db.add(
            OrganizationMember(
                organization_id=invite.organization_id,
                user_id=user_id,
                role=invite.role,
            )
        )

    invite.status = InviteStatus.accepted
    db.commit()

    record(
        db,
        invite.organization_id,
        user_id,
        action="joined",
        entity_type="member",
        entity_id=user_id,
        changes={"email": user.email, "role": invite.role.value if hasattr(invite.role, "value") else invite.role},
    )

    org = db.query(Organization).filter(Organization.id == invite.organization_id).first()
    return {
        "message": f"You have joined {org.name if org else 'the organisation'}",
        "organization_id": invite.organization_id,
    }


@router.post("/{invite_id}/decline")
async def decline_invite(
    invite_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn down an invitation."""
    user_id = int(current_user.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    invite = db.query(OrganizationInvite).filter(OrganizationInvite.id == invite_id).first()

    if not invite or not user or invite.email.lower() != user.email.lower():
        raise HTTPException(status_code=404, detail="Invitation not found")

    invite.status = InviteStatus.rejected
    db.commit()
    return {"message": "Invitation declined"}
