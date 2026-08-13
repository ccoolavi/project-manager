from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import TaskCommentCreate, TaskCommentResponse
from models import TaskComment
from middleware.auth import get_current_user
from utils.tenancy import require_membership, resolve_task
from utils.audit import record
from utils.notifications import notify

router = APIRouter(
    prefix="/api/orgs/{org_id}/projects/{project_id}/tasks/{sub_project_id}/{task_id}/comments",
    tags=["comments"],
)


@router.get("", response_model=List[TaskCommentResponse])
async def list_comments(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List comments on a task, oldest first."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    resolve_task(db, org_id, project_id, sub_project_id, task_id)

    comments = (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
        .all()
    )
    return [TaskCommentResponse.from_orm(c) for c in comments]


@router.post("", response_model=TaskCommentResponse)
async def create_comment(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    payload: TaskCommentCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a comment to a task."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    comment = TaskComment(task_id=task_id, user_id=user_id, content=content)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    record(db, org_id, user_id, "commented", "task", task_id, {"title": task.title})

    if task.assignee_id and task.assignee_id != user_id:
        notify(
            db, task.assignee_id, org_id, "comment_added",
            "New comment", f'New comment on "{task.title}"',
            "task", task_id,
        )

    return TaskCommentResponse.from_orm(comment)


@router.delete("/{comment_id}")
async def delete_comment(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    task_id: int,
    comment_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a comment: its author, or an org owner/admin, may remove it."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    resolve_task(db, org_id, project_id, sub_project_id, task_id)

    comment = (
        db.query(TaskComment)
        .filter(TaskComment.id == comment_id, TaskComment.task_id == task_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != user_id and member.role.value not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="You can only delete your own comments")

    db.delete(comment)
    db.commit()

    return {"message": "Comment deleted"}
