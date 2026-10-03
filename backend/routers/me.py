"""Cross-org, per-user endpoints — aggregate across every org the caller
belongs to, rather than being scoped to one org_id from the URL/JWT."""

from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    MyOrgResponse, MyTimelineResponse, MyTimelineTask, MyTimelineSprint,
    ControlledOrgScope, ControlledProject,
)
from models import (
    Organization, OrganizationMember, Task, SubProject, Project,
    Sprint, SprintTask, ProjectMember, TaskDependency, TaskStatus,
)
from utils import workload
from middleware.auth import get_current_user

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/orgs", response_model=List[MyOrgResponse])
async def my_orgs(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every org the caller belongs to, with their role and that org's
    member count — for the My Organizations hub."""
    user_id = int(current_user.get("sub"))
    memberships = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.user_id == user_id)
        .all()
    )
    result = []
    for m in memberships:
        org = db.query(Organization).filter(Organization.id == m.organization_id).first()
        count = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == m.organization_id
        ).count()
        result.append(MyOrgResponse(
            id=org.id, name=org.name, description=org.description,
            role=m.role, member_count=count,
        ))
    return result


@router.get("/timeline", response_model=MyTimelineResponse)
async def my_timeline(
    from_: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
    include_done: bool = False,
    work_days: Optional[str] = None,
    hours_per_day: float = workload.DEFAULT_HOURS_PER_DAY,
    today: Optional[date] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tasks assigned to the caller across every org (and every project they
    were invited to directly), plus the workload picture for planning.

    Only the caller's own assigned tasks — never an org's full backlog and
    never anyone else's tasks. `today` lets the browser say what day it is
    where the person lives (the server clock is UTC); it must be within a
    day of the server's date so it cannot be used to probe odd ranges."""
    user_id = int(current_user.get("sub"))

    server_today = datetime.utcnow().date()
    if today is None:
        today = server_today
    elif abs((today - server_today).days) > 1:
        raise HTTPException(status_code=422, detail="today is too far from the server date")
    window_from = from_ or today - timedelta(days=14)
    window_to = to or today + timedelta(days=90)
    if window_to < window_from:
        raise HTTPException(status_code=422, detail="'to' must not be before 'from'")
    if (window_to - window_from).days > workload.MAX_WINDOW_DAYS:
        raise HTTPException(status_code=422, detail="window is longer than one year")
    if not 1 <= hours_per_day <= 24:
        raise HTTPException(status_code=422, detail="hours_per_day must be between 1 and 24")
    try:
        work_set = workload.parse_work_days(work_days)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    org_ids = [
        m.organization_id
        for m in db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).all()
    ]
    direct_project_ids = [
        pm.project_id
        for pm in db.query(ProjectMember).filter(ProjectMember.user_id == user_id).all()
    ]
    empty = MyTimelineResponse(
        tasks=[], sprints=[],
        window={"from": window_from.isoformat(), "to": window_to.isoformat(), "today": today.isoformat()},
    )
    if not org_ids and not direct_project_ids:
        return empty

    scope = []
    if org_ids:
        scope.append(Project.organization_id.in_(org_ids))
    if direct_project_ids:
        scope.append(Project.id.in_(direct_project_ids))

    rows = (
        db.query(Task, SubProject, Project, Organization)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .join(Organization, Project.organization_id == Organization.id)
        .filter(or_(*scope), Task.assignee_id == user_id)
        .all()
    )

    def day(dt):
        return dt.date() if dt else None

    def in_window(task):
        """Open tasks: unscheduled and overdue always show; the rest by range
        overlap. Done tasks only when asked for, and only inside the window."""
        due, start = day(task.due_date), day(task.start_date)
        is_done = task.status == TaskStatus.done
        if is_done and not include_done:
            return False
        if not is_done and (due is None or due < today):
            return True
        first = start if start and due and start <= due else (due or start)
        last = due or start
        if first is None:
            return not is_done
        return first <= window_to and last >= window_from

    rows = [r for r in rows if in_window(r[0])]
    task_ids = [r[0].id for r in rows]

    # One batched query for "who is blocking whom", never one per task.
    blocker_due = {}
    blocked_ids = set()
    if task_ids:
        dep_rows = (
            db.query(TaskDependency.task_id, Task.due_date)
            .join(Task, TaskDependency.depends_on_id == Task.id)
            .filter(TaskDependency.task_id.in_(task_ids), Task.status != TaskStatus.done)
            .all()
        )
        for tid, due in dep_rows:
            blocked_ids.add(tid)
            if due is not None:
                d = day(due)
                if tid not in blocker_due or d > blocker_due[tid]:
                    blocker_due[tid] = d

    work_tasks = [
        workload.WorkTask(
            id=task.id, org_id=org.id, status=task.status.value,
            due=day(task.due_date), start=day(task.start_date),
            estimate_hours=task.estimate_hours, story_points=task.story_points,
            blocked=task.id in blocked_ids, blocker_due=blocker_due.get(task.id),
        )
        for task, _sub, _project, org in rows
    ]
    result = workload.compute(
        work_tasks, today, window_from, window_to, work_set, hours_per_day,
    )

    tasks = []
    for task, sub_project, project, org in rows:
        info = result["per_task"][task.id]
        bd = blocker_due.get(task.id)
        tasks.append(MyTimelineTask(
            id=task.id, title=task.title, status=task.status, priority=task.priority,
            due_date=task.due_date, start_date=task.start_date, story_points=task.story_points,
            estimate_hours=task.estimate_hours,
            organization_id=org.id, organization_name=org.name,
            project_id=project.id, project_name=project.name,
            sub_project_id=sub_project.id,
            effort_hours=info["effort_hours"], effort_source=info["effort_source"],
            remaining_hours=info["remaining_hours"],
            scheduled_start=info["scheduled_start"], scheduled_end=info["scheduled_end"],
            overdue=info["overdue"],
            blocked=task.id in blocked_ids, blocker_due=bd.isoformat() if bd else None,
        ))

    sprint_rows = []
    if task_ids:
        sprint_rows = (
            db.query(Sprint, Organization)
            .join(SprintTask, SprintTask.sprint_id == Sprint.id)
            .join(Project, Sprint.project_id == Project.id)
            .join(Organization, Project.organization_id == Organization.id)
            .filter(
                SprintTask.task_id.in_(task_ids),
                Sprint.status != "completed",
                Sprint.start_date <= datetime.combine(window_to, datetime.min.time()) + timedelta(days=1),
                Sprint.end_date >= datetime.combine(window_from, datetime.min.time()),
            )
            .distinct()
            .all()
        )
    sprints = [
        MyTimelineSprint(
            id=sprint.id, name=sprint.name, start_date=sprint.start_date, end_date=sprint.end_date,
            organization_id=org.id, organization_name=org.name,
        )
        for sprint, org in sprint_rows
    ]

    return MyTimelineResponse(
        tasks=tasks, sprints=sprints,
        days=result["days"], warnings=result["warnings"],
        unscheduled_task_ids=result["unscheduled_task_ids"], summary=result["summary"],
        window={"from": window_from.isoformat(), "to": window_to.isoformat(), "today": today.isoformat()},
    )


@router.get("/controlled-scopes", response_model=List[ControlledOrgScope])
async def my_controlled_scopes(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Orgs where the caller is owner/admin, with their projects — the only
    scopes the caller is allowed to grant access to via an invite."""
    user_id = int(current_user.get("sub"))
    memberships = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.role.in_(["owner", "admin"]),
        )
        .all()
    )
    result = []
    for m in memberships:
        org = db.query(Organization).filter(Organization.id == m.organization_id).first()
        projects = db.query(Project).filter(Project.organization_id == org.id).all()
        result.append(ControlledOrgScope(
            org_id=org.id, org_name=org.name,
            projects=[ControlledProject(id=p.id, name=p.name) for p in projects],
        ))
    return result
