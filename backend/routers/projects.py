from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import ProjectCreate, ProjectUpdate, ProjectResponse, SubProjectCreate, SubProjectResponse
from models import Project, SubProject, Organization, OrganizationMember
from middleware.auth import get_current_user, get_current_org_id
from utils.tenancy import resolve_project
from utils.audit import record
from utils.action_otp import require_recent_action_otp

router = APIRouter(prefix="/api/orgs/{org_id}/projects", tags=["projects"])

# Projects
@router.post("", response_model=ProjectResponse)
async def create_project(
    org_id: int,
    project_data: ProjectCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project"""
    user_id = int(current_user.get("sub"))

    # Check org membership and permissions
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member or member.role.value not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Permission denied")

    new_project = Project(
        organization_id=org_id,
        name=project_data.name,
        description=project_data.description,
        status=project_data.status,
        created_by=user_id
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    record(db, org_id, user_id, "created", "project", new_project.id, {"name": new_project.name})

    return ProjectResponse.from_orm(new_project)

@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all projects in organization"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    projects = db.query(Project).filter(Project.organization_id == org_id).all()
    return [ProjectResponse.from_orm(p) for p in projects]

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    org_id: int,
    project_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get project details"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectResponse.from_orm(project)

@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    org_id: int,
    project_id: int,
    project_data: ProjectUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update project"""
    user_id = int(current_user.get("sub"))

    # Check permissions
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member or member.role.value not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Permission denied")

    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project_data.name:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    if project_data.status:
        project.status = project_data.status

    db.commit()
    db.refresh(project)

    return ProjectResponse.from_orm(project)

@router.delete("/{project_id}")
async def delete_project(
    org_id: int,
    project_id: int,
    current_user: dict = Depends(get_current_user),
    _recent_otp: None = Depends(require_recent_action_otp),
    db: Session = Depends(get_db)
):
    """Delete project"""
    user_id = int(current_user.get("sub"))

    # Check permissions
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member or member.role.value != "owner":
        raise HTTPException(status_code=403, detail="Only owner can delete projects")

    project = db.query(Project).filter(
        Project.id == project_id,
        Project.organization_id == org_id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    name = project.name
    db.delete(project)
    db.commit()

    record(db, org_id, user_id, "deleted", "project", project_id, {"name": name})

    return {"message": "Project deleted"}

# Sub-Projects
@router.post("/{project_id}/sub-projects", response_model=SubProjectResponse)
async def create_sub_project(
    org_id: int,
    project_id: int,
    sub_project_data: SubProjectCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a sub-project"""
    user_id = int(current_user.get("sub"))

    # Check permissions
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member or member.role.value not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Prove the parent project belongs to this org before attaching a child to it.
    resolve_project(db, org_id, project_id)

    new_sub = SubProject(
        project_id=project_id,
        name=sub_project_data.name,
        description=sub_project_data.description,
        status=sub_project_data.status,
        created_by=user_id
    )
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)

    return SubProjectResponse.from_orm(new_sub)

@router.get("/{project_id}/sub-projects", response_model=List[SubProjectResponse])
async def list_sub_projects(
    org_id: int,
    project_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List sub-projects"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    # Without this the caller could list sub-projects of another org's project.
    resolve_project(db, org_id, project_id)

    subs = db.query(SubProject).filter(SubProject.project_id == project_id).all()
    return [SubProjectResponse.from_orm(s) for s in subs]
