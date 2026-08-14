"""Cross-org, per-user endpoints — aggregate across every org the caller
belongs to, rather than being scoped to one org_id from the URL/JWT."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import MyOrgResponse, MyTimelineResponse, MyTimelineTask, MyTimelineSprint
from models import (
    Organization, OrganizationMember, Task, SubProject, Project,
    Sprint, SprintTask,
)
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
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tasks assigned to the caller across every org they belong to, plus
    the sprints those tasks live in — never an org's full backlog."""
    user_id = int(current_user.get("sub"))
    org_ids = [
        m.organization_id
        for m in db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).all()
    ]
    if not org_ids:
        return MyTimelineResponse(tasks=[], sprints=[])

    rows = (
        db.query(Task, SubProject, Project, Organization)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .join(Organization, Project.organization_id == Organization.id)
        .filter(Project.organization_id.in_(org_ids), Task.assignee_id == user_id)
        .all()
    )

    tasks = [
        MyTimelineTask(
            id=task.id, title=task.title, status=task.status, priority=task.priority,
            due_date=task.due_date, start_date=task.start_date, story_points=task.story_points,
            organization_id=org.id, organization_name=org.name,
            project_id=project.id, project_name=project.name,
            sub_project_id=sub_project.id,
        )
        for task, sub_project, project, org in rows
    ]

    task_ids = [t.id for t in tasks]
    sprint_rows = []
    if task_ids:
        sprint_rows = (
            db.query(Sprint, Organization)
            .join(SprintTask, SprintTask.sprint_id == Sprint.id)
            .join(Project, Sprint.project_id == Project.id)
            .join(Organization, Project.organization_id == Organization.id)
            .filter(SprintTask.task_id.in_(task_ids))
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

    return MyTimelineResponse(tasks=tasks, sprints=sprints)
