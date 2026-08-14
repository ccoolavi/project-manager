"""Tenancy guards.

Every org-scoped route must prove two things before touching data:

1. the caller is a member of the organization named in the path, and
2. the object being addressed actually belongs to that organization.

Checking only (1) is what allowed a member of org A to read org B's tasks by
passing their own ``org_id`` together with a foreign ``sub_project_id``.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import OrganizationMember, Project, SubProject, Task, ProjectMember


def require_membership(db: Session, org_id: int, user_id: int) -> OrganizationMember:
    """Return the caller's membership row, or raise 403."""
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    return member


def require_role(member: OrganizationMember, *allowed_roles: str) -> OrganizationMember:
    """Raise 403 unless the membership carries one of ``allowed_roles``."""
    if member.role.value not in allowed_roles:
        raise HTTPException(status_code=403, detail="Permission denied")
    return member


def resolve_project(db: Session, org_id: int, project_id: int) -> Project:
    """Fetch a project, proving it belongs to ``org_id``."""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.organization_id == org_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def resolve_sub_project(
    db: Session, org_id: int, project_id: int, sub_project_id: int
) -> SubProject:
    """Fetch a sub-project, proving the full org -> project -> sub-project chain."""
    resolve_project(db, org_id, project_id)
    sub_project = (
        db.query(SubProject)
        .filter(
            SubProject.id == sub_project_id,
            SubProject.project_id == project_id,
        )
        .first()
    )
    if not sub_project:
        raise HTTPException(status_code=404, detail="Sub-project not found")
    return sub_project


def require_project_access(
    db: Session, project_id: int, user_id: int, need_edit: bool = False
):
    """Grant access if the caller is a member of the project's organization
    (any role — existing org-role checks elsewhere still gate edit rights
    for org members), OR holds a ProjectMember row for this exact project.

    An org member's edit rights are unchanged by this function; it only
    adds a second, narrower path for a caller with no org membership at
    all. need_edit for that narrower path requires role == "editor".
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    org_member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == project.organization_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if org_member:
        return org_member

    project_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )
    if not project_member:
        raise HTTPException(status_code=403, detail="Access denied")
    if need_edit and project_member.role.value != "editor":
        raise HTTPException(status_code=403, detail="Permission denied")
    return project_member


def resolve_task(
    db: Session, org_id: int, project_id: int, sub_project_id: int, task_id: int
) -> Task:
    """Fetch a task, proving the full org -> project -> sub-project -> task chain."""
    resolve_sub_project(db, org_id, project_id, sub_project_id)
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.sub_project_id == sub_project_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
