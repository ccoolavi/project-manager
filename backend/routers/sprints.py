from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import SprintCreate, SprintUpdate, SprintResponse, SprintTaskAdd
from models import Sprint, SprintTask, SubProject, Task, TaskStatus
from middleware.auth import get_current_user
from utils.tenancy import require_membership, require_role, resolve_project, resolve_task

router = APIRouter(prefix="/api/orgs/{org_id}/projects/{project_id}/sprints", tags=["sprints"])


def _sprint_response(db: Session, sprint: Sprint) -> SprintResponse:
    sprint_tasks = db.query(SprintTask).filter(SprintTask.sprint_id == sprint.id).all()
    task_ids = [st.task_id for st in sprint_tasks]
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    total_points = sum(t.story_points or 0 for t in tasks)
    completed_points = sum(
        (t.story_points or 0) for t in tasks if _status_value(t.status) == "done"
    )
    return SprintResponse(
        id=sprint.id,
        project_id=sprint.project_id,
        name=sprint.name,
        goal=sprint.goal,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        status=sprint.status,
        created_at=sprint.created_at,
        task_count=len(tasks),
        total_points=total_points,
        completed_points=completed_points,
    )


def _status_value(status) -> str:
    return status.value if hasattr(status, "value") else status


@router.post("", response_model=SprintResponse)
async def create_sprint(
    org_id: int,
    project_id: int,
    payload: SprintCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor")
    resolve_project(db, org_id, project_id)

    sprint = Sprint(
        organization_id=org_id,
        project_id=project_id,
        name=payload.name,
        goal=payload.goal,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
    )
    db.add(sprint)
    db.commit()
    db.refresh(sprint)

    return _sprint_response(db, sprint)


@router.get("", response_model=List[SprintResponse])
async def list_sprints(
    org_id: int,
    project_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    resolve_project(db, org_id, project_id)

    sprints = (
        db.query(Sprint)
        .filter(Sprint.organization_id == org_id, Sprint.project_id == project_id)
        .order_by(Sprint.start_date.desc())
        .all()
    )
    return [_sprint_response(db, s) for s in sprints]


def _resolve_sprint(db: Session, org_id: int, project_id: int, sprint_id: int) -> Sprint:
    sprint = (
        db.query(Sprint)
        .filter(Sprint.id == sprint_id, Sprint.organization_id == org_id, Sprint.project_id == project_id)
        .first()
    )
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return sprint


@router.put("/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    org_id: int,
    project_id: int,
    sprint_id: int,
    payload: SprintUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor")
    sprint = _resolve_sprint(db, org_id, project_id, sprint_id)

    if payload.name is not None:
        sprint.name = payload.name
    if payload.goal is not None:
        sprint.goal = payload.goal
    if payload.start_date is not None:
        sprint.start_date = payload.start_date
    if payload.end_date is not None:
        sprint.end_date = payload.end_date
    if payload.status is not None:
        sprint.status = payload.status

    db.commit()
    db.refresh(sprint)
    return _sprint_response(db, sprint)


@router.delete("/{sprint_id}")
async def delete_sprint(
    org_id: int,
    project_id: int,
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin")
    sprint = _resolve_sprint(db, org_id, project_id, sprint_id)

    db.delete(sprint)
    db.commit()
    return {"message": "Sprint deleted"}


@router.post("/{sprint_id}/tasks")
async def add_task_to_sprint(
    org_id: int,
    project_id: int,
    sprint_id: int,
    payload: SprintTaskAdd,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a task to the sprint's backlog. A task can belong to only one
    sprint at a time — the unique constraint on SprintTask.task_id enforces
    this even if two requests race."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor", "member")
    _resolve_sprint(db, org_id, project_id, sprint_id)

    task = (
        db.query(Task)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .filter(Task.id == payload.task_id, SubProject.project_id == project_id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="That task is not in this project")

    existing = db.query(SprintTask).filter(SprintTask.task_id == payload.task_id).first()
    if existing:
        detail = (
            "That task is already in this sprint"
            if existing.sprint_id == sprint_id
            else "That task is already in a different sprint"
        )
        raise HTTPException(status_code=409, detail=detail)

    st = SprintTask(sprint_id=sprint_id, task_id=payload.task_id)
    db.add(st)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That task is already in a sprint")

    sprint = _resolve_sprint(db, org_id, project_id, sprint_id)
    return _sprint_response(db, sprint)


@router.delete("/{sprint_id}/tasks/{task_id}")
async def remove_task_from_sprint(
    org_id: int,
    project_id: int,
    sprint_id: int,
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin", "editor", "member")
    _resolve_sprint(db, org_id, project_id, sprint_id)

    st = (
        db.query(SprintTask)
        .filter(SprintTask.sprint_id == sprint_id, SprintTask.task_id == task_id)
        .first()
    )
    if not st:
        raise HTTPException(status_code=404, detail="That task is not in this sprint")

    db.delete(st)
    db.commit()
    return {"message": "Task removed from sprint"}


@router.get("/{sprint_id}/tasks")
async def list_sprint_tasks(
    org_id: int,
    project_id: int,
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from schemas import TaskResponse

    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    _resolve_sprint(db, org_id, project_id, sprint_id)

    sprint_tasks = db.query(SprintTask).filter(SprintTask.sprint_id == sprint_id).all()
    task_ids = [st.task_id for st in sprint_tasks]
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    return [TaskResponse.from_orm(t) for t in tasks]


@router.get("/{sprint_id}/burndown")
async def sprint_burndown(
    org_id: int,
    project_id: int,
    sprint_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Daily completed story points across the sprint, plus the remaining
    total each day — the line a burndown chart actually plots.

    Task completion date is approximated by ``updated_at`` (the same proxy
    used in analytics.py's velocity endpoint), since there is no dedicated
    completed_at column.
    """
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    sprint = _resolve_sprint(db, org_id, project_id, sprint_id)

    sprint_tasks = db.query(SprintTask).filter(SprintTask.sprint_id == sprint_id).all()
    task_ids = [st.task_id for st in sprint_tasks]
    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all() if task_ids else []
    total_points = sum(t.story_points or 0 for t in tasks)

    start = sprint.start_date.date()
    end = min(sprint.end_date.date(), datetime.utcnow().date())
    if end < start:
        end = start

    completed_by_day = defaultdict(int)
    for t in tasks:
        if _status_value(t.status) == "done":
            completed_by_day[t.updated_at.date()] += t.story_points or 0

    days = []
    cumulative = 0
    d = start
    while d <= end:
        cumulative += completed_by_day.get(d, 0)
        days.append(
            {
                "date": d.isoformat(),
                "completed_points": completed_by_day.get(d, 0),
                "remaining_points": max(0, total_points - cumulative),
            }
        )
        d += timedelta(days=1)

    return {"total_points": total_points, "days": days}
