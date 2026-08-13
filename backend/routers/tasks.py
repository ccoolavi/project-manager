from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import TaskCreate, TaskUpdate, TaskResponse
from models import Task, OrganizationMember
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/orgs/{org_id}/projects/{project_id}/tasks", tags=["tasks"])

@router.post("/{sub_project_id}", response_model=TaskResponse)
async def create_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a task"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    new_task = Task(
        sub_project_id=sub_project_id,
        title=task_data.title,
        description=task_data.description,
        status=task_data.status,
        priority=task_data.priority,
        assignee_id=task_data.assignee_id,
        due_date=task_data.due_date,
        created_by=user_id
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    return TaskResponse.from_orm(new_task)

@router.get("/{sub_project_id}", response_model=List[TaskResponse])
async def list_tasks(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List tasks in sub-project"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    tasks = db.query(Task).filter(Task.sub_project_id == sub_project_id).all()
    return [TaskResponse.from_orm(t) for t in tasks]

@router.get("/{sub_project_id}/{task_id}", response_model=TaskResponse)
async def get_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get task details"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    task = db.query(Task).filter(
        Task.id == task_id,
        Task.sub_project_id == sub_project_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskResponse.from_orm(task)

@router.put("/{sub_project_id}/{task_id}", response_model=TaskResponse)
async def update_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    task_data: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update task"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    task = db.query(Task).filter(
        Task.id == task_id,
        Task.sub_project_id == sub_project_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task_data.title:
        task.title = task_data.title
    if task_data.description is not None:
        task.description = task_data.description
    if task_data.status:
        task.status = task_data.status
    if task_data.priority:
        task.priority = task_data.priority
    if task_data.assignee_id is not None:
        task.assignee_id = task_data.assignee_id
    if task_data.due_date is not None:
        task.due_date = task_data.due_date

    db.commit()
    db.refresh(task)

    return TaskResponse.from_orm(task)

@router.delete("/{sub_project_id}/{task_id}")
async def delete_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete task"""
    user_id = int(current_user.get("sub"))

    # Check org membership
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id
    ).first()

    if not member or member.role.value not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Permission denied")

    task = db.query(Task).filter(
        Task.id == task_id,
        Task.sub_project_id == sub_project_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()

    return {"message": "Task deleted"}
