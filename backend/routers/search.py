from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from middleware.auth import get_current_user
from models import Habit, KaizenLog, Project, SubProject, Task
from utils.tenancy import require_membership

router = APIRouter(prefix="/api/orgs/{org_id}/search", tags=["search"])

MIN_QUERY_LEN = 2
RESULT_LIMIT = 20


@router.get("")
async def search(
    org_id: int,
    q: str = "",
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search across projects, tasks, habits and kaizen logs in one organisation.

    Tasks have no direct organization_id, so they are matched by joining
    task -> sub_project -> project -> organization. Personal entities (habits,
    kaizen) are further restricted to the caller, matching their privacy
    everywhere else in the app.
    """
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    query = q.strip()
    if len(query) < MIN_QUERY_LEN:
        raise HTTPException(
            status_code=400, detail=f"Search text must be at least {MIN_QUERY_LEN} characters"
        )

    like = f"%{query}%"
    results = []

    projects = (
        db.query(Project)
        .filter(Project.organization_id == org_id, Project.name.ilike(like))
        .limit(RESULT_LIMIT)
        .all()
    )
    for p in projects:
        results.append(
            {
                "type": "project",
                "id": p.id,
                "title": p.name,
                "subtitle": "Project",
                "project_id": p.id,
            }
        )

    tasks = (
        db.query(Task, SubProject.project_id)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .filter(Project.organization_id == org_id, Task.title.ilike(like))
        .limit(RESULT_LIMIT)
        .all()
    )
    for task, project_id in tasks:
        results.append(
            {
                "type": "task",
                "id": task.id,
                "title": task.title,
                "subtitle": f"Task · {task.status.value}",
                "project_id": project_id,
                "sub_project_id": task.sub_project_id,
            }
        )

    habits = (
        db.query(Habit)
        .filter(
            Habit.organization_id == org_id,
            Habit.user_id == user_id,
            Habit.title.ilike(like),
        )
        .limit(RESULT_LIMIT)
        .all()
    )
    for h in habits:
        results.append({"type": "habit", "id": h.id, "title": h.title, "subtitle": "Habit"})

    logs = (
        db.query(KaizenLog)
        .filter(
            KaizenLog.organization_id == org_id,
            KaizenLog.user_id == user_id,
            KaizenLog.title.ilike(like),
        )
        .limit(RESULT_LIMIT)
        .all()
    )
    for k in logs:
        results.append({"type": "kaizen", "id": k.id, "title": k.title, "subtitle": "Kaizen log"})

    return results[:RESULT_LIMIT]
