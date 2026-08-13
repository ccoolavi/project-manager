from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List

from database import get_db
from schemas import (
    OrganizationCreate, OrganizationResponse, OrganizationMemberResponse,
    InviteMember, InviteResponse
)
from models import (
    Organization, User, OrganizationMember, OrganizationInvite,
    Project, SubProject, Task, UserRole, InviteStatus
)
from utils.audit import record
from utils.action_otp import require_recent_action_otp
from utils.notifications import notify
from utils.tenancy import require_membership
from middleware.auth import (
    get_current_user, get_current_org_id, require_org_role
)

router = APIRouter(prefix="/api/orgs", tags=["organizations"])

@router.post("", response_model=OrganizationResponse)
async def create_organization(
    org_data: OrganizationCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new organization"""
    user_id = int(current_user.get("sub"))

    new_org = Organization(
        name=org_data.name,
        description=org_data.description,
        owner_id=user_id
    )
    db.add(new_org)
    db.commit()
    db.refresh(new_org)

    # Add creator as owner member
    owner_member = OrganizationMember(
        organization_id=new_org.id,
        user_id=user_id,
        role=UserRole.owner
    )
    db.add(owner_member)
    db.commit()

    return OrganizationResponse.from_orm(new_org)

@router.get("", response_model=List[OrganizationResponse])
async def list_organizations(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all organizations for current user"""
    user_id = int(current_user.get("sub"))

    # Get all orgs where user is a member
    orgs = db.query(Organization).join(
        OrganizationMember,
        Organization.id == OrganizationMember.organization_id
    ).filter(OrganizationMember.user_id == user_id).all()

    return [OrganizationResponse.from_orm(org) for org in orgs]

@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get organization details"""
    user_id = int(current_user.get("sub"))

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if user is a member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    return OrganizationResponse.from_orm(org)

# Member Management
@router.get("/{org_id}/members", response_model=List[OrganizationMemberResponse])
async def list_members(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all members in an organization"""
    user_id = int(current_user.get("sub"))

    # Check if user is a member
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    members = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id
    ).all()

    return [OrganizationMemberResponse.from_orm(m) for m in members]

# Returns a plain confirmation message, not a member record: when the invitee has
# no account yet there is no membership row to return.
@router.post("/{org_id}/members")
async def add_member(
    org_id: int,
    invite: InviteMember,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Invite a member to organization (admin+ only)"""
    user_id = int(current_user.get("sub"))
    user_role = current_user.get("role")

    # Check if user is admin+
    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only admins can add members")

    # Create invite
    expires_at = datetime.utcnow() + timedelta(days=7)
    new_invite = OrganizationInvite(
        organization_id=org_id,
        email=invite.email,
        role=invite.role,
        created_by=user_id,
        expires_at=expires_at
    )
    db.add(new_invite)
    db.commit()

    # If user already exists, auto-add to org
    existing_user = db.query(User).filter(User.email == invite.email).first()
    if existing_user:
        member = OrganizationMember(
            organization_id=org_id,
            user_id=existing_user.id,
            role=invite.role
        )
        db.add(member)
        new_invite.status = InviteStatus.accepted
        db.commit()

        org_name = db.query(Organization).filter(Organization.id == org_id).first().name
        notify(
            db, existing_user.id, org_id, "invite_received",
            "Added to an organisation", f'You were added to "{org_name}"',
            "organization", org_id,
        )

    record(db, org_id, user_id, "invited", "member", None,
           {"email": invite.email, "role": invite.role.value if hasattr(invite.role, "value") else invite.role})

    return {"message": f"Invitation sent to {invite.email}"}

@router.delete("/{org_id}/members/{member_id}")
async def remove_member(
    org_id: int,
    member_id: int,
    current_user: dict = Depends(get_current_user),
    _recent_otp: None = Depends(require_recent_action_otp),
    db: Session = Depends(get_db)
):
    """Remove a member from organization (owner only)"""
    user_id = int(current_user.get("sub"))
    user_role = current_user.get("role")

    # Check if user is owner
    if user_role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can remove members")

    member = db.query(OrganizationMember).filter(
        OrganizationMember.id == member_id,
        OrganizationMember.organization_id == org_id
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    removed_user_id = member.user_id
    db.delete(member)
    db.commit()

    record(db, org_id, user_id, "removed", "member", removed_user_id)

    return {"message": "Member removed"}

# Invites
@router.get("/{org_id}/invites", response_model=List[InviteResponse])
async def list_invites(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List pending invites for organization (admin+ only)"""
    user_role = current_user.get("role")

    if user_role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")

    invites = db.query(OrganizationInvite).filter(
        OrganizationInvite.organization_id == org_id,
        OrganizationInvite.status == InviteStatus.pending
    ).all()

    return [InviteResponse.from_orm(inv) for inv in invites]

@router.post("/{org_id}/invites/{invite_id}/accept")
async def accept_invite(
    org_id: int,
    invite_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Accept an invitation"""
    user_id = int(current_user.get("sub"))

    invite = db.query(OrganizationInvite).filter(
        OrganizationInvite.id == invite_id,
        OrganizationInvite.organization_id == org_id
    ).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    if invite.status != InviteStatus.pending:
        raise HTTPException(status_code=400, detail="Invite already processed")

    # Add user to organization
    member = OrganizationMember(
        organization_id=org_id,
        user_id=user_id,
        role=invite.role
    )
    db.add(member)
    invite.status = InviteStatus.accepted
    db.commit()

    return {"message": "Invite accepted"}


@router.get("/{org_id}/audit-logs")
async def list_audit_logs(
    org_id: int,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recent activity in this organisation. Owners and admins only."""
    from models import AuditLog, User as UserModel
    from utils.tenancy import require_membership, require_role

    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin")

    entries = (
        db.query(AuditLog)
        .filter(AuditLog.organization_id == org_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(min(limit, 500))
        .all()
    )

    names = {u.id: u.name or u.email for u in db.query(UserModel).all()}
    return [
        {
            "id": e.id,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "changes": e.changes,
            "timestamp": e.timestamp,
            "actor": names.get(e.user_id, "Someone"),
        }
        for e in entries
    ]


@router.get("/{org_id}/workload")
async def get_workload(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Each member's assigned tasks, grouped by status.

    Tasks have no direct organization_id, so counts are aggregated through the
    same task -> sub_project -> project -> organization join used everywhere
    else in this codebase, filtered to this org's members only.
    """
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    members = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id)
        .all()
    )
    member_ids = [m.user_id for m in members]
    names = {m.user_id: (m.user.name or m.user.email) for m in members}

    rows = (
        db.query(Task.assignee_id, Task.status, func.count(Task.id))
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .filter(Project.organization_id == org_id, Task.assignee_id.in_(member_ids))
        .group_by(Task.assignee_id, Task.status)
        .all()
    )

    counts = {uid: {"todo": 0, "in_progress": 0, "review": 0, "done": 0} for uid in member_ids}
    for assignee_id, status_value, count in rows:
        status_key = status_value.value if hasattr(status_value, "value") else status_value
        counts[assignee_id][status_key] = count

    return [
        {
            "user_id": uid,
            "user_name": names[uid],
            "todo": counts[uid]["todo"],
            "in_progress": counts[uid]["in_progress"],
            "review": counts[uid]["review"],
            "done": counts[uid]["done"],
            "total": sum(counts[uid].values()),
        }
        for uid in member_ids
    ]
