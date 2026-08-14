from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import TaskCreate, TaskUpdate, TaskResponse, TaskDependencyCreate, TaskDependencyResponse, BulkTaskAction
from models import Project, SubProject, Task, TaskDependency, TaskPriority, TaskStatus, OrganizationMember
from middleware.auth import get_current_user
from utils.audit import record
from utils.notifications import notify
from utils.tenancy import (
    require_membership,
    require_role,
    require_project_access,
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
    require_project_access(db, org_id, project_id, user_id)
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
    require_project_access(db, org_id, project_id, user_id)
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
    grantor = require_project_access(db, org_id, project_id, user_id, need_edit=True)
    if isinstance(grantor, OrganizationMember):
        require_role(grantor, "owner", "admin", "editor", "member")
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


# Every other task route in this file is scoped under a single project and
# section (the URL carries both), because that's how the Kanban board reads
# tasks. The calendar (B10) and bulk operations (B11) need to see every task
# in an organisation at once, which needs a flatter shape — hence a second
# router with a shorter prefix, registered separately in main.py.
org_router = APIRouter(prefix="/api/orgs/{org_id}/tasks", tags=["tasks-org"])


@org_router.get("")
async def list_all_org_tasks(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All tasks across every project in the org, for the calendar and Gantt
    views. Includes project_id/project_name alongside the usual task fields —
    a bare TaskResponse has no project_id, and the calendar needs it to open
    the Task Detail Panel without a second round trip per task.
    """
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    rows = (
        db.query(Task, SubProject.project_id, Project.name)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .all()
    )

    return [
        {
            **TaskResponse.from_orm(task).model_dump(),
            "project_id": project_id,
            "project_name": project_name,
        }
        for task, project_id, project_name in rows
    ]


@org_router.post("/bulk")
async def bulk_task_action(
    org_id: int,
    body: BulkTaskAction,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply one action to many tasks at once.

    Every task_id is independently proved to belong to this org via the same
    sub_project -> project chain every other route in this file walks, rather
    than trusting the caller — a task from another org silently slipping
    through here would be the cross-org leak this codebase has already had to
    fix once (see utils/tenancy.py).
    """
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)

    if body.action == "delete":
        require_role(member, "owner", "admin", "editor")
    else:
        require_role(member, "owner", "admin", "editor", "member")

    if body.action not in ("update_status", "assign", "set_priority", "delete"):
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    if body.action == "update_status" and body.value not in [s.value for s in TaskStatus]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.value}")
    if body.action == "set_priority" and body.value not in [p.value for p in TaskPriority]:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {body.value}")

    assignee_id = None
    if body.action == "assign":
        assignee_id = int(body.value) if body.value else None

    updated = 0
    failed = []
    newly_assigned_task_titles = []

    for task_id in body.task_ids:
        task = (
            db.query(Task)
            .join(SubProject, Task.sub_project_id == SubProject.id)
            .join(Project, SubProject.project_id == Project.id)
            .filter(Task.id == task_id, Project.organization_id == org_id)
            .first()
        )
        if not task:
            failed.append({"task_id": task_id, "reason": "not found in this organisation"})
            continue

        if body.action == "delete":
            db.delete(task)
        elif body.action == "update_status":
            task.status = body.value
        elif body.action == "set_priority":
            task.priority = body.value
        elif body.action == "assign":
            task.assignee_id = assignee_id
            if assignee_id and assignee_id != user_id:
                newly_assigned_task_titles.append(task.title)

        updated += 1

    db.commit()

    # One summary notification per bulk-assign, not one per task — assigning
    # twenty tasks at once should not flood the assignee with twenty pings.
    if newly_assigned_task_titles:
        notify(
            db, assignee_id, org_id, "task_assigned",
            "Tasks assigned to you",
            f"You were assigned {len(newly_assigned_task_titles)} task(s) in bulk.",
            "task", None,
        )

    return {"updated": updated, "failed": failed}
