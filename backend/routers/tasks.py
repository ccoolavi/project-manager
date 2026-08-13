from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import TaskCreate, TaskUpdate, TaskResponse
from models import Task
from middleware.auth import get_current_user
from utils.tenancy import (
    require_membership,
    require_role,
    resolve_sub_project,
    resolve_task,
)

router = APIRouter(prefix="/api/orgs/{org_id}/projects/{project_id}/tasks", tags=["tasks"])


@router.post("/{sub_project_id}", response_model=TaskResponse)
async def create_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a task inside a sub-project."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor", "member")
    resolve_sub_project(db, org_id, project_id, sub_project_id)

    new_task = Task(
        sub_project_id=sub_project_id,
        title=task_data.title,
        description=task_data.description,
        status=task_data.status,
        priority=task_data.priority,
        assignee_id=task_data.assignee_id,
        due_date=task_data.due_date,
        created_by=user_id,
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
    db: Session = Depends(get_db),
):
    """List tasks in a sub-project."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    resolve_sub_project(db, org_id, project_id, sub_project_id)

    tasks = db.query(Task).filter(Task.sub_project_id == sub_project_id).all()
    return [TaskResponse.from_orm(t) for t in tasks]


@router.get("/{sub_project_id}/{task_id}", response_model=TaskResponse)
async def get_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get task details."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)

    return TaskResponse.from_orm(task)


@router.put("/{sub_project_id}/{task_id}", response_model=TaskResponse)
async def update_task(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    task_data: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a task."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor", "member")
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)

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
    db: Session = Depends(get_db),
):
    """Delete a task."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor")
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)

    db.delete(task)
    db.commit()

    return {"message": "Task deleted"}
