"""Read-only reporting endpoints. No new models — every result here is an
aggregation over data that already exists elsewhere in the app.

Aggregation happens in Python rather than SQL date-truncation (which behaves
differently across drivers) because the scale here — a handful of users, at
most a few hundred tasks per org — makes "fetch the rows, group in Python"
both simpler to read and fast enough; this is a single-server hobby-scale app,
not a data warehouse.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from middleware.auth import get_current_user
from models import Project, SubProject, Task, TimeEntry, User
from utils.tenancy import require_membership

router = APIRouter(prefix="/api/orgs/{org_id}/analytics", tags=["analytics"])


@router.get("/tasks")
async def task_analytics(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Completion rate overall and per project."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    rows = (
        db.query(Project.id, Project.name, Task.status)
        .join(SubProject, SubProject.project_id == Project.id)
        .join(Task, Task.sub_project_id == SubProject.id)
        .filter(Project.organization_id == org_id)
        .all()
    )

    per_project = defaultdict(lambda: {"name": "", "total": 0, "done": 0})
    total, done = 0, 0
    for project_id, project_name, status in rows:
        bucket = per_project[project_id]
        bucket["name"] = project_name
        bucket["total"] += 1
        total += 1
        if (status.value if hasattr(status, "value") else status) == "done":
            bucket["done"] += 1
            done += 1

    projects = [
        {
            "project_id": pid,
            "project_name": b["name"],
            "total": b["total"],
            "done": b["done"],
            "completion_rate": round(b["done"] / b["total"], 3) if b["total"] else 0,
        }
        for pid, b in per_project.items()
    ]

    return {
        "overall": {
            "total": total,
            "done": done,
            "completion_rate": round(done / total, 3) if total else 0,
        },
        "projects": projects,
    }


@router.get("/time")
async def time_analytics(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hours per category per user, last 30 days."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    cutoff = datetime.utcnow() - timedelta(days=30)
    rows = (
        db.query(TimeEntry, User.name, User.email)
        .join(User, TimeEntry.user_id == User.id)
        .filter(TimeEntry.organization_id == org_id, TimeEntry.date >= cutoff)
        .all()
    )

    totals = defaultdict(int)
    names = {}
    for entry, name, email in rows:
        key = (entry.user_id, entry.category or "uncategorised")
        totals[key] += entry.duration_minutes
        names[entry.user_id] = name or email

    return [
        {
            "user_id": uid,
            "user_name": names[uid],
            "category": category,
            "hours": round(minutes / 60, 1),
        }
        for (uid, category), minutes in totals.items()
    ]


@router.get("/velocity")
async def velocity_analytics(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tasks completed per week, last 8 weeks.

    Uses updated_at as a proxy for completion time — there is no dedicated
    completed_at column — so a task that bounces back out of "done" and later
    returns to it is only counted at its most recent transition.
    """
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)

    week_starts = []
    today = datetime.utcnow().date()
    monday_this_week = today - timedelta(days=today.weekday())
    for i in range(7, -1, -1):
        week_starts.append(monday_this_week - timedelta(weeks=i))

    cutoff = datetime.combine(week_starts[0], datetime.min.time())
    rows = (
        db.query(Task.updated_at)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .filter(
            Project.organization_id == org_id,
            Task.status == "done",
            Task.updated_at >= cutoff,
        )
        .all()
    )

    counts = defaultdict(int)
    for (updated_at,) in rows:
        week = updated_at.date() - timedelta(days=updated_at.date().weekday())
        counts[week] += 1

    return [
        {"week_start": w.isoformat(), "completed": counts.get(w, 0)}
        for w in week_starts
    ]
