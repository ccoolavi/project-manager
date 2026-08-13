from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import TaskCreate, TaskUpdate, TaskResponse, TaskDependencyCreate, TaskDependencyResponse
from models import SubProject, Task, TaskDependency
from middleware.auth import get_current_user
from utils.audit import record
from utils.notifications import notify
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
        start_date=task_data.start_date,
        story_points=task_data.story_points or 0,
        created_by=user_id,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    record(db, org_id, user_id, "created", "task", new_task.id, {"title": new_task.title})

    if new_task.assignee_id and new_task.assignee_id != user_id:
        notify(
            db, new_task.assignee_id, org_id, "task_assigned",
            "New task assigned to you", f'You were assigned "{new_task.title}"',
            "task", new_task.id,
        )

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
    assignee_changed = (
        task_data.assignee_id is not None and task_data.assignee_id != task.assignee_id
    )
    if task_data.assignee_id is not None:
        task.assignee_id = task_data.assignee_id
    if task_data.due_date is not None:
        task.due_date = task_data.due_date
    if task_data.start_date is not None:
        task.start_date = task_data.start_date
    if task_data.story_points is not None:
        task.story_points = task_data.story_points

    db.commit()
    db.refresh(task)

    if assignee_changed and task.assignee_id and task.assignee_id != user_id:
        notify(
            db, task.assignee_id, org_id, "task_assigned",
            "New task assigned to you", f'You were assigned "{task.title}"',
            "task", task.id,
        )

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

    title = task.title
    db.delete(task)
    db.commit()

    record(db, org_id, user_id, "deleted", "task", task_id, {"title": title})

    return {"message": "Task deleted"}


def _dependency_response(dep: TaskDependency) -> TaskDependencyResponse:
    return TaskDependencyResponse(
        id=dep.id,
        task_id=dep.task_id,
        depends_on_id=dep.depends_on_id,
        depends_on_title=dep.depends_on.title,
        depends_on_status=(
            dep.depends_on.status.value
            if hasattr(dep.depends_on.status, "value")
            else dep.depends_on.status
        ),
        created_at=dep.created_at,
    )


@router.get("/{sub_project_id}/{task_id}/dependencies", response_model=List[TaskDependencyResponse])
async def list_dependencies(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tasks that must reach done before this one can proceed."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    resolve_task(db, org_id, project_id, sub_project_id, task_id)

    deps = db.query(TaskDependency).filter(TaskDependency.task_id == task_id).all()
    return [_dependency_response(d) for d in deps]


@router.post("/{sub_project_id}/{task_id}/dependencies", response_model=TaskDependencyResponse)
async def add_dependency(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    payload: TaskDependencyCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark this task as blocked by another task in the same project."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor", "member")
    resolve_task(db, org_id, project_id, sub_project_id, task_id)

    if payload.depends_on_id == task_id:
        raise HTTPException(status_code=400, detail="A task cannot depend on itself")

    # The blocking task must belong to the same project — walked through its
    # own sub_project, since a task carries no direct project_id.
    blocker = (
        db.query(Task)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .filter(Task.id == payload.depends_on_id, SubProject.project_id == project_id)
        .first()
    )
    if not blocker:
        raise HTTPException(status_code=404, detail="That task is not in this project")

    existing = (
        db.query(TaskDependency)
        .filter(TaskDependency.task_id == task_id, TaskDependency.depends_on_id == payload.depends_on_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="That dependency already exists")

    dep = TaskDependency(task_id=task_id, depends_on_id=payload.depends_on_id)
    db.add(dep)
    db.commit()
    db.refresh(dep)

    return _dependency_response(dep)


@router.delete("/{sub_project_id}/{task_id}/dependencies/{dependency_id}")
async def remove_dependency(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    dependency_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a blocking relationship."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor", "member")
    resolve_task(db, org_id, project_id, sub_project_id, task_id)

    dep = (
        db.query(TaskDependency)
        .filter(TaskDependency.id == dependency_id, TaskDependency.task_id == task_id)
        .first()
    )
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")

    db.delete(dep)
    db.commit()

    return {"message": "Dependency removed"}
