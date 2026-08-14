# Cross-org view, personal timeline, and scoped invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a user who belongs to multiple organizations a place to see and manage all of them, a personal cross-org timeline of tasks assigned to them, and a way to grant an existing user comment-only or edit access to one specific project (not a whole org) — provisioning a temporary password automatically when the invitee has no account yet.

**Architecture:** Backend adds one new table (`project_members`), one new tenancy helper (`require_project_access`, additive alongside the existing `require_membership`/`resolve_*` chain-proving helpers), a new `/api/me/*` router for cross-org aggregation, and extends the existing org-invite endpoint plus a new project-invite endpoint with a "does this email already have an account" branch. Frontend adds two new tabs to the existing tab-state dashboard (no router change, matching how every other view in this app works) and extends `MemberManager`'s invite form with a scope + role selector.

**Tech Stack:** FastAPI + SQLAlchemy + SQLite (backend/), React 18 + Vite (frontend/), pytest (backend/tests/).

**Spec:** `docs/superpowers/specs/2026-08-14-cross-org-view-design.md`

## Global Constraints

- No admin-role exception to access control, ever: every new/modified route re-derives access from the DB on every request (either `OrganizationMember` or `ProjectMember` for the exact `project_id`/`org_id` in the URL) — never trust a client-supplied id without checking it against the resource it's attached to (the existing `resolve_project`/`resolve_sub_project`/`resolve_task` chain-proving pattern already in `backend/utils/tenancy.py`).
- "My Timeline" only ever shows tasks where `Task.assignee_id == current_user`. Never all tasks in an org the user administers.
- No task-detail duplication — clicking a task anywhere always opens the real live record via the existing `TaskDetailPanel`.
- A `ProjectMember` grant never creates an `OrganizationMember` row and never appears in that org's member roster.
- Temporary passwords are generated only when the invited email has no existing `User` row; existing users are just granted access, no password touched.
- The full existing backend pytest suite (88 tests as of this session) must stay green throughout — this work is additive to the permission model, not a change to any existing check.

---

## Task 1: `ProjectMember` model + `generate_password` helper

**Files:**
- Modify: `backend/models.py` (add near the bottom, after `SprintTask`)
- Modify: `backend/utils/security.py`
- Test: `backend/tests/test_project_members_model.py`

**Interfaces:**
- Produces: `models.ProjectRole` (str enum: `viewer`, `editor`), `models.ProjectMember` (columns: `id`, `project_id`, `user_id`, `role`, `invited_by`, `created_at`), `utils.security.generate_password(length: int = 16) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_project_members_model.py
"""ProjectMember grants project-scoped access without touching org membership."""

from conftest import auth, make_org_with_project, register, login
from models import ProjectMember, ProjectRole
from database import SessionLocal


def test_project_member_row_created_directly(client):
    ctx = make_org_with_project(client, "pm-model@test.com")
    register(client, "viewer-model@test.com")
    viewer_token = login(client, "viewer-model@test.com")
    viewer = client.get("/api/auth/me", headers=auth(viewer_token)).json()

    from database import get_db
    from main import app
    db = next(app.dependency_overrides[get_db]())
    member = ProjectMember(
        project_id=ctx["project_id"],
        user_id=viewer["id"],
        role=ProjectRole.viewer,
        invited_by=viewer["id"],
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    assert member.id is not None
    assert member.role == ProjectRole.viewer
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && source venv/bin/activate 2>/dev/null; pytest tests/test_project_members_model.py -v`
Expected: FAIL — `ImportError: cannot import name 'ProjectMember' from 'models'`

- [ ] **Step 3: Add the model**

In `backend/models.py`, after the `class SprintTask(Base):` block, add:

```python
class ProjectRole(str, enum.Enum):
    viewer = "viewer"
    editor = "editor"


class ProjectMember(Base):
    """Grants one user access to exactly one project, independent of
    OrganizationMember. Does not add the user to the org roster and does
    not appear anywhere OrganizationMember does."""

    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(SQLEnum(ProjectRole), default=ProjectRole.viewer)
    invited_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User", foreign_keys=[user_id])
```

Also add `generate_password` to `backend/utils/security.py` (mirroring the one in `pm-cli.py` line ~117 — check that file for the exact character set it uses, keep them consistent):

```python
import secrets
import string

def generate_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))
```

(Add the `import secrets` / `import string` lines to the existing import block at the top of the file if not already present — check first, `utils/security.py` already imports from `datetime`/`jose`/`passlib` so add alongside those.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_project_members_model.py -v`
Expected: PASS

Note: `Base.metadata.create_all(bind=engine)` in `main.py` runs on app startup, so no manual migration step is needed — the new table appears automatically the next time the backend process starts (both in tests, which build a throwaway DB per test, and in production, which needs the running backend process restarted after this deploy — call this out in Task 12).

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/models.py backend/utils/security.py backend/tests/test_project_members_model.py
git commit -m "feat(backend): add ProjectMember model and generate_password helper"
```

---

## Task 2: `require_project_access` tenancy helper

**Files:**
- Modify: `backend/utils/tenancy.py`
- Test: `backend/tests/test_project_access.py`

**Interfaces:**
- Consumes: `models.ProjectMember`, `models.ProjectRole` (Task 1).
- Produces: `utils.tenancy.require_project_access(db, project_id, user_id, need_edit=False)` — returns the `OrganizationMember` or `ProjectMember` row that granted access, raises `HTTPException(404)` if the project doesn't exist, `HTTPException(403)` if neither grants access or the grant doesn't cover `need_edit`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_project_access.py
"""require_project_access: org members always pass; ProjectMember grants a
narrow, project-scoped fallback; neither means a hard 403."""

import pytest
from fastapi import HTTPException

from conftest import make_org_with_project, register, login
from database import get_db
from main import app
from models import ProjectMember, ProjectRole
from utils.tenancy import require_project_access


def _db():
    return next(app.dependency_overrides[get_db]())


def test_org_member_always_has_access(client):
    ctx = make_org_with_project(client, "rpa-org@test.com")
    db = _db()
    from models import User
    owner = db.query(User).filter(User.email == "rpa-org@test.com").first()
    result = require_project_access(db, ctx["project_id"], owner.id)
    assert result is not None
    db.close()


def test_non_member_without_grant_is_denied(client):
    ctx = make_org_with_project(client, "rpa-a@test.com")
    make_org_with_project(client, "rpa-b@test.com")
    db = _db()
    from models import User
    outsider = db.query(User).filter(User.email == "rpa-b@test.com").first()
    with pytest.raises(HTTPException) as exc:
        require_project_access(db, ctx["project_id"], outsider.id)
    assert exc.value.status_code == 403
    db.close()


def test_project_viewer_gets_view_but_not_edit(client):
    ctx = make_org_with_project(client, "rpa-c@test.com")
    register(client, "rpa-viewer@test.com")
    login(client, "rpa-viewer@test.com")
    db = _db()
    from models import User
    viewer = db.query(User).filter(User.email == "rpa-viewer@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=viewer.id, role=ProjectRole.viewer))
    db.commit()

    result = require_project_access(db, ctx["project_id"], viewer.id, need_edit=False)
    assert result is not None

    with pytest.raises(HTTPException) as exc:
        require_project_access(db, ctx["project_id"], viewer.id, need_edit=True)
    assert exc.value.status_code == 403
    db.close()


def test_project_editor_gets_edit(client):
    ctx = make_org_with_project(client, "rpa-d@test.com")
    register(client, "rpa-editor@test.com")
    login(client, "rpa-editor@test.com")
    db = _db()
    from models import User
    editor = db.query(User).filter(User.email == "rpa-editor@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=editor.id, role=ProjectRole.editor))
    db.commit()

    result = require_project_access(db, ctx["project_id"], editor.id, need_edit=True)
    assert result is not None
    db.close()
```

Delete the placeholder `test_project_viewer_gets_view_but_not_edit(): pass` stub — only the `client`-fixture versions above stay in the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_project_access.py -v`
Expected: FAIL — `ImportError: cannot import name 'require_project_access' from 'utils.tenancy'`

- [ ] **Step 3: Implement the helper**

In `backend/utils/tenancy.py`, add the import and function:

```python
from models import OrganizationMember, Project, SubProject, Task, ProjectMember
```

```python
def require_project_access(
    db: Session, project_id: int, user_id: int, need_edit: bool = False
):
    """Grant access if the caller is a member of the project's organization
    (any role — existing org-role checks elsewhere still gate edit rights
    for org members), OR holds a ProjectMember row for this exact project.

    An org member's edit rights are unchanged by this function; it only
    adds a second, narrower path for a caller with no org membership at
    all. need_edit for that narrower path requires role == "editor".
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    org_member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == project.organization_id,
            OrganizationMember.user_id == user_id,
        )
        .first()
    )
    if org_member:
        return org_member

    project_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )
    if not project_member:
        raise HTTPException(status_code=403, detail="Access denied")
    if need_edit and project_member.role.value != "editor":
        raise HTTPException(status_code=403, detail="Permission denied")
    return project_member
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_project_access.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/utils/tenancy.py backend/tests/test_project_access.py
git commit -m "feat(backend): add require_project_access tenancy helper"
```

---

## Task 3: Wire `require_project_access` into task view/edit and comment routes

**Files:**
- Modify: `backend/routers/tasks.py` (`get_task`, `update_task`, `list_tasks`)
- Modify: `backend/routers/comments.py` (`list_comments`, `create_comment`)
- Test: `backend/tests/test_project_access.py` (append)

**Interfaces:**
- Consumes: `require_project_access` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_project_access.py`:

```python
def test_project_viewer_can_list_and_get_tasks_via_api(client):
    ctx = make_org_with_project(client, "rpa-e@test.com")
    task = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": "t1", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    ).json()

    register(client, "rpa-viewer2@test.com")
    viewer_token = login(client, "rpa-viewer2@test.com")
    db = _db()
    from models import User
    viewer = db.query(User).filter(User.email == "rpa-viewer2@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=viewer.id, role=ProjectRole.viewer))
    db.commit()
    db.close()

    res = client.get(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        headers=auth(viewer_token),
    )
    assert res.status_code == 200
    assert any(t["id"] == task["id"] for t in res.json())

    res_get = client.get(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}/{task['id']}",
        headers=auth(viewer_token),
    )
    assert res_get.status_code == 200


def test_project_viewer_cannot_edit_task_but_editor_can(client):
    ctx = make_org_with_project(client, "rpa-f@test.com")
    task = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": "t2", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    ).json()

    register(client, "rpa-viewer3@test.com")
    viewer_token = login(client, "rpa-viewer3@test.com")
    register(client, "rpa-editor3@test.com")
    editor_token = login(client, "rpa-editor3@test.com")

    db = _db()
    from models import User
    viewer = db.query(User).filter(User.email == "rpa-viewer3@test.com").first()
    editor = db.query(User).filter(User.email == "rpa-editor3@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=viewer.id, role=ProjectRole.viewer))
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=editor.id, role=ProjectRole.editor))
    db.commit()
    db.close()

    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}/{task['id']}"
    denied = client.put(task_url, json={"status": "in_progress"}, headers=auth(viewer_token))
    assert denied.status_code == 403

    allowed = client.put(task_url, json={"status": "in_progress"}, headers=auth(editor_token))
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "in_progress"


def test_project_viewer_can_comment_but_outsider_cannot(client):
    ctx = make_org_with_project(client, "rpa-g@test.com")
    task = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": "t3", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    ).json()
    comments_url = (
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}"
        f"/tasks/{ctx['sub_id']}/{task['id']}/comments"
    )

    register(client, "rpa-viewer4@test.com")
    viewer_token = login(client, "rpa-viewer4@test.com")
    db = _db()
    from models import User
    viewer = db.query(User).filter(User.email == "rpa-viewer4@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=viewer.id, role=ProjectRole.viewer))
    db.commit()
    db.close()

    ok = client.post(comments_url, json={"content": "hi"}, headers=auth(viewer_token))
    assert ok.status_code == 200

    register(client, "rpa-outsider4@test.com")
    outsider_token = login(client, "rpa-outsider4@test.com")
    denied = client.post(comments_url, json={"content": "nope"}, headers=auth(outsider_token))
    assert denied.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_project_access.py -v`
Expected: FAIL on the three new tests — `list_tasks`/`get_task`/`update_task`/comments routes still call `require_membership`, which 403s a non-org-member regardless of any `ProjectMember` row.

- [ ] **Step 3: Wire the helper into the routes**

In `backend/routers/tasks.py`, add the import:

```python
from utils.tenancy import (
    require_membership,
    require_role,
    require_project_access,
    resolve_sub_project,
    resolve_task,
)
```

Change `list_tasks`:

```python
async def list_tasks(
    org_id: int,
    project_id: int,
    sub_project_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List tasks in a sub-project."""
    user_id = int(current_user.get("sub"))
    require_project_access(db, project_id, user_id)
    resolve_sub_project(db, org_id, project_id, sub_project_id)

    tasks = db.query(Task).filter(Task.sub_project_id == sub_project_id).all()
    return [TaskResponse.from_orm(t) for t in tasks]
```

Change `get_task`:

```python
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
    require_project_access(db, project_id, user_id)
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)

    return TaskResponse.from_orm(task)
```

Change `update_task`'s access check only (leave the field-update body untouched):

```python
    user_id = int(current_user.get("sub"))
    require_project_access(db, project_id, user_id, need_edit=True)
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)
```

(This replaces the previous two lines — `member = require_membership(...)` and
`require_role(member, "owner", "admin", "editor", "member")` — with a single
call. An org member with role `viewer` previously fell through
`require_membership` and was then rejected by `require_role`; with
`require_project_access`, an org member is granted access unconditionally
by the `org_member` branch regardless of role, which would let an org
`viewer` edit tasks — not intended. Add the role check back for the org-member
case specifically:)

```python
    user_id = int(current_user.get("sub"))
    grantor = require_project_access(db, project_id, user_id, need_edit=True)
    from models import OrganizationMember as _OrgMember
    if isinstance(grantor, _OrgMember):
        require_role(grantor, "owner", "admin", "editor", "member")
    task = resolve_task(db, org_id, project_id, sub_project_id, task_id)
```

(Keep the `from models import ... as _OrgMember` inline import here rather than
adding it to the top-level import block — `models.OrganizationMember` is not
otherwise used in this file, and the alias makes the isinstance check
self-explanatory at the point it's used.)

Do **not** change `create_task`, `delete_task`, or the dependency endpoints —
per the spec, `ProjectMember` grants view/comment/edit-existing-task rights
only, not create/delete/dependency-management rights.

In `backend/routers/comments.py`, add the import and update both routes:

```python
from utils.tenancy import require_membership, require_project_access, resolve_task
```

`list_comments` and `create_comment` both currently start with
`require_membership(db, org_id, user_id)` — change both occurrences to:

```python
    require_project_access(db, project_id, user_id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_project_access.py -v`
Expected: PASS (7 tests total in this file)

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `cd backend && pytest -q`
Expected: all tests pass (88 existing + new ones)

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/routers/tasks.py backend/routers/comments.py backend/tests/test_project_access.py
git commit -m "feat(backend): enforce project-scoped access on task view/edit and comment routes"
```

---

## Task 4: `ProjectMember` schemas + project-scoped invite endpoint (with temp password)

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/projects.py`
- Test: `backend/tests/test_project_invites.py`

**Interfaces:**
- Consumes: `models.ProjectMember`, `models.ProjectRole` (Task 1), `utils.security.generate_password`, `utils.security.hash_password`.
- Produces: `POST /api/orgs/{org_id}/projects/{project_id}/members` — request `{email, role}` (`role` in `"viewer"`/`"editor"`), response `{"message": str, "temporary_password": str | None}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_project_invites.py
"""Project-scoped invites: org owner/admin can grant viewer/editor access to
one project without touching the org roster; brand-new emails get a
provisioned account + temporary password, existing accounts don't."""

from conftest import auth, make_org_with_project, register, login


def test_project_invite_creates_account_with_temp_password_for_new_email(client):
    ctx = make_org_with_project(client, "pi-owner@test.com")
    res = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/members",
        json={"email": "pi-brandnew@test.com", "role": "viewer"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["temporary_password"]
    assert len(body["temporary_password"]) >= 12

    # The new account can log in with that password and reach the project.
    login_res = client.post(
        "/api/auth/login",
        json={"identifier": "pi-brandnew@test.com", "password": body["temporary_password"]},
    )
    assert login_res.status_code == 200


def test_project_invite_no_password_for_existing_user(client):
    ctx = make_org_with_project(client, "pi-owner2@test.com")
    register(client, "pi-existing@test.com")

    res = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/members",
        json={"email": "pi-existing@test.com", "role": "editor"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200, res.text
    assert res.json()["temporary_password"] is None


def test_project_invite_does_not_create_org_membership(client):
    ctx = make_org_with_project(client, "pi-owner3@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/members",
        json={"email": "pi-scoped@test.com", "role": "viewer"},
        headers=auth(ctx["token"]),
    )
    members = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
    assert not any(m["user"]["email"] == "pi-scoped@test.com" for m in members)


def test_project_invite_requires_owner_or_admin(client):
    ctx = make_org_with_project(client, "pi-owner4@test.com")
    register(client, "pi-member4@test.com")
    member_token = login(client, "pi-member4@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "pi-member4@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    member_token = login(client, "pi-member4@test.com")  # re-issue so JWT sees the new org

    res = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/members",
        json={"email": "pi-target4@test.com", "role": "viewer"},
        headers=auth(member_token),
    )
    assert res.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_project_invites.py -v`
Expected: FAIL with 404 (route doesn't exist yet)

- [ ] **Step 3: Add schemas**

In `backend/schemas.py`, near `InviteMember`/`InviteResponse`, add:

```python
from models import ProjectRole  # add ProjectRole to the existing `from models import ...` line at the top of the file instead of a second import line

class ProjectMemberInvite(BaseModel):
    email: EmailStr
    role: ProjectRole = ProjectRole.viewer

class ProjectMemberInviteResult(BaseModel):
    message: str
    temporary_password: Optional[str] = None
```

(Merge `ProjectRole` into the existing top-of-file import
`from models import UserRole, TaskStatus, TaskPriority, ProjectStatus, InviteStatus`
rather than adding a separate import statement.)

- [ ] **Step 4: Implement the endpoint**

In `backend/routers/projects.py`, add imports and the route:

```python
from models import Project, SubProject, Organization, OrganizationMember, User, ProjectMember, ProjectRole
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, SubProjectCreate, SubProjectResponse,
    ProjectMemberInvite, ProjectMemberInviteResult,
)
from utils.security import hash_password, generate_password
```

```python
@router.post("/{project_id}/members", response_model=ProjectMemberInviteResult)
async def invite_project_member(
    org_id: int,
    project_id: int,
    invite: ProjectMemberInvite,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Grant an existing-or-new user viewer/editor access to exactly this
    project, without adding them to the org's member roster. Only an
    owner/admin of the project's own org may do this."""
    user_id = int(current_user.get("sub"))
    member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == user_id,
    ).first()
    if not member or member.role.value not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can grant project access")

    project = resolve_project(db, org_id, project_id)

    target = db.query(User).filter(User.email == invite.email).first()
    temporary_password = None
    if not target:
        temporary_password = generate_password()
        target = User(
            email=invite.email,
            name=invite.email.split("@")[0],
            password_hash=hash_password(temporary_password),
        )
        db.add(target)
        db.commit()
        db.refresh(target)

    existing_grant = db.query(ProjectMember).filter(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == target.id,
    ).first()
    if existing_grant:
        existing_grant.role = invite.role
    else:
        db.add(ProjectMember(
            project_id=project.id,
            user_id=target.id,
            role=invite.role,
            invited_by=user_id,
        ))
    db.commit()

    return ProjectMemberInviteResult(
        message=f"{invite.email} now has {invite.role.value} access to {project.name}.",
        temporary_password=temporary_password,
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_project_invites.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && pytest -q`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/schemas.py backend/routers/projects.py backend/tests/test_project_invites.py
git commit -m "feat(backend): add project-scoped viewer/editor invites with temp-password provisioning"
```

---

## Task 5: Temp-password branch for the existing org-level invite endpoint

**Files:**
- Modify: `backend/routers/organizations.py` (`add_member`)
- Modify: `backend/schemas.py` (extend `InviteResponse`-adjacent return shape — this endpoint currently returns a raw dict, not a schema, so no schema change is required; document the new key inline)
- Test: `backend/tests/test_org_invite_password.py`

**Interfaces:**
- Consumes: `utils.security.generate_password`, `utils.security.hash_password` (Task 1).
- Produces: `POST /api/orgs/{org_id}/members` now returns `{"message": str, "temporary_password": str | None}` instead of just `{"message": str}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_org_invite_password.py
"""Org-level invite: brand-new emails are provisioned with a temporary
password immediately (no more silent pending-invite-with-no-account);
existing accounts are just added, no password touched."""

from conftest import auth, make_org_with_project, register


def test_org_invite_new_email_gets_account_and_password(client):
    ctx = make_org_with_project(client, "oi-owner@test.com")
    res = client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "oi-brandnew@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["temporary_password"]

    login_res = client.post(
        "/api/auth/login",
        json={"identifier": "oi-brandnew@test.com", "password": body["temporary_password"]},
    )
    assert login_res.status_code == 200

    members = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
    assert any(m["user"]["email"] == "oi-brandnew@test.com" for m in members)


def test_org_invite_existing_email_no_password(client):
    ctx = make_org_with_project(client, "oi-owner2@test.com")
    register(client, "oi-existing@test.com")

    res = client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "oi-existing@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200, res.text
    assert res.json()["temporary_password"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_org_invite_password.py -v`
Expected: FAIL — `test_org_invite_new_email_gets_account_and_password` fails because today's `add_member` never creates a `User` row for a brand-new email, so the login attempt 401s, and `body["temporary_password"]` (a `KeyError`, since the key doesn't exist at all) fails before that.

- [ ] **Step 3: Rewrite the new-email branch of `add_member`**

In `backend/routers/organizations.py`, add the import:

```python
from utils.security import hash_password, generate_password
```

Replace the body of `add_member` from `# Create invite` through the end of the
function with:

```python
    # If the invitee already has an account, add them straight away — same
    # behavior as before. If not, provision the account here rather than
    # leaving a pending invite with nothing for them to sign in with; this
    # matches the admin-provisions/hands-over-credentials pattern already
    # used everywhere else accounts get created in this app.
    temporary_password = None
    existing_user = db.query(User).filter(User.email == invite.email).first()
    if not existing_user:
        temporary_password = generate_password()
        existing_user = User(
            email=invite.email,
            name=invite.email.split("@")[0],
            password_hash=hash_password(temporary_password),
        )
        db.add(existing_user)
        db.commit()
        db.refresh(existing_user)

    already_member = db.query(OrganizationMember).filter(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.user_id == existing_user.id,
    ).first()
    if not already_member:
        member = OrganizationMember(
            organization_id=org_id,
            user_id=existing_user.id,
            role=invite.role,
        )
        db.add(member)
        db.commit()

        org_name = db.query(Organization).filter(Organization.id == org_id).first().name
        notify(
            db, existing_user.id, org_id, "invite_received",
            "Added to an organisation", f'You were added to "{org_name}"',
            "organization", org_id,
        )

    record(db, org_id, user_id, "invited", "member", None,
           {"email": invite.email, "role": invite.role.value if hasattr(invite.role, "value") else invite.role})

    return {
        "message": f"{invite.email} now has access to this organisation."
        if temporary_password is None
        else f"Account created for {invite.email}. Give them the temporary password shown.",
        "temporary_password": temporary_password,
    }
```

This removes the old `OrganizationInvite` pending-row creation entirely for
the case where the account doesn't exist yet, since there is no longer a
self-registration step to wait for — the account is provisioned immediately.
(The `OrganizationInvite` model and its `list_invites`/`accept_invite`
endpoints are left in place for now since other code — `PendingInvites.jsx`
— reads them; they simply won't gain new pending rows through this path
going forward. Cleaning that up further is out of scope for this plan.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_org_invite_password.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite**

Run: `cd backend && pytest -q`
Expected: all pass — pay particular attention to any existing test that asserted the old pending-invite-with-no-account behavior (search first: `grep -rn "OrganizationInvite\|pending" backend/tests/`); if one exists and now fails because it expected no account to be created, update that test's assertions to match the new, intended behavior rather than reverting this change.

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/routers/organizations.py backend/tests/test_org_invite_password.py
git commit -m "feat(backend): provision account + temp password for brand-new org invitees"
```

---

## Task 6: `GET/PATCH /api/orgs/{org_id}` leave endpoint + `/api/me/orgs`

**Files:**
- Modify: `backend/routers/organizations.py` (add `PATCH /{org_id}`, `DELETE /{org_id}/members/me`)
- Create: `backend/routers/me.py`
- Modify: `backend/schemas.py` (add `MyOrgResponse`)
- Modify: `backend/main.py` (register the new router)
- Test: `backend/tests/test_me_orgs.py`

**Interfaces:**
- Produces: `PATCH /api/orgs/{org_id}` (owner/admin only, body `OrganizationUpdate` — schema already exists, unused today), `DELETE /api/orgs/{org_id}/members/me`, `GET /api/me/orgs` → `List[MyOrgResponse]` where each item is `{id, name, description, role, member_count}`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_me_orgs.py
"""My Organizations hub: list every org I belong to with my role and member
count; rename requires owner/admin; leaving is self-service except the sole
remaining owner can't leave."""

from conftest import auth, make_org_with_project, register, login


def test_me_orgs_lists_role_and_member_count(client):
    ctx = make_org_with_project(client, "me-orgs1@test.com")
    res = client.get("/api/me/orgs", headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["id"] == ctx["org_id"]
    assert body[0]["role"] == "owner"
    assert body[0]["member_count"] == 1


def test_patch_org_requires_owner_or_admin(client):
    ctx = make_org_with_project(client, "me-orgs2@test.com")
    register(client, "me-orgs2-member@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "me-orgs2-member@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    member_token = login(client, "me-orgs2-member@test.com")

    denied = client.patch(
        f"/api/orgs/{ctx['org_id']}", json={"name": "New Name"}, headers=auth(member_token)
    )
    assert denied.status_code == 403

    allowed = client.patch(
        f"/api/orgs/{ctx['org_id']}", json={"name": "New Name"}, headers=auth(ctx["token"])
    )
    assert allowed.status_code == 200
    assert allowed.json()["name"] == "New Name"


def test_member_can_leave_org(client):
    ctx = make_org_with_project(client, "me-orgs3@test.com")
    register(client, "me-orgs3-member@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "me-orgs3-member@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    member_token = login(client, "me-orgs3-member@test.com")

    res = client.delete(f"/api/orgs/{ctx['org_id']}/members/me", headers=auth(member_token))
    assert res.status_code == 200

    orgs = client.get("/api/me/orgs", headers=auth(member_token)).json()
    assert orgs == []


def test_sole_owner_cannot_leave_with_other_members_present(client):
    ctx = make_org_with_project(client, "me-orgs4@test.com")
    register(client, "me-orgs4-member@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "me-orgs4-member@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    res = client.delete(f"/api/orgs/{ctx['org_id']}/members/me", headers=auth(ctx["token"]))
    assert res.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_me_orgs.py -v`
Expected: FAIL — none of these routes exist yet (404s)

- [ ] **Step 3: Add the schema**

In `backend/schemas.py`, near `OrganizationResponse`:

```python
class MyOrgResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    role: UserRole
    member_count: int
```

- [ ] **Step 4: Add `PATCH`/`leave` to `organizations.py`**

```python
@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: int,
    org_data: OrganizationUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename/describe an org (owner/admin only)."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)
    require_role(member, "owner", "admin")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org_data.name is not None:
        org.name = org_data.name
    if org_data.description is not None:
        org.description = org_data.description
    db.commit()
    db.refresh(org)
    return OrganizationResponse.from_orm(org)


@router.delete("/{org_id}/members/me")
async def leave_organization(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Leave an org. The sole remaining owner of an org with other members
    still in it cannot leave — someone has to own it."""
    user_id = int(current_user.get("sub"))
    member = require_membership(db, org_id, user_id)

    if member.role.value == "owner":
        other_owners = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.role == UserRole.owner,
            OrganizationMember.user_id != user_id,
        ).count()
        other_members = db.query(OrganizationMember).filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id != user_id,
        ).count()
        if other_owners == 0 and other_members > 0:
            raise HTTPException(
                status_code=400,
                detail="Promote someone else to owner before you leave.",
            )

    db.delete(member)
    db.commit()
    return {"message": "You left the organisation."}
```

`OrganizationUpdate` and `require_membership`/`require_role`/`Organization`/
`OrganizationMember`/`UserRole` are already imported in this file; no new
imports needed for this step beyond what Task 5 already added.

- [ ] **Step 5: Create `backend/routers/me.py`**

```python
"""Cross-org, per-user endpoints — aggregate across every org the caller
belongs to, rather than being scoped to one org_id from the URL/JWT."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import MyOrgResponse
from models import Organization, OrganizationMember
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
```

- [ ] **Step 6: Register the router**

In `backend/main.py`, add the import alongside the others and register it:

```python
from routers import me
...
app.include_router(me.router)
```

(Match the existing import style in `main.py` — check the top of the file for
whether routers are imported individually or via `from routers import ...`,
and follow whichever pattern is already there.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_me_orgs.py -v`
Expected: PASS (4 tests)

- [ ] **Step 8: Run the full suite**

Run: `cd backend && pytest -q`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/routers/organizations.py backend/routers/me.py backend/schemas.py backend/main.py backend/tests/test_me_orgs.py
git commit -m "feat(backend): add My Organizations hub endpoints (list/rename/leave)"
```

---

## Task 7: `GET /api/me/timeline`

**Files:**
- Modify: `backend/routers/me.py`
- Modify: `backend/schemas.py`
- Test: `backend/tests/test_me_timeline.py`

**Interfaces:**
- Consumes: `models.Task`, `models.SubProject`, `models.Project`, `models.Sprint`, `models.SprintTask` (all exist already).
- Produces: `GET /api/me/timeline` → `MyTimelineResponse { tasks: List[MyTimelineTask], sprints: List[MyTimelineSprint] }`. Each `MyTimelineTask` carries `id, title, status, priority, due_date, start_date, story_points, organization_id, organization_name, project_id, project_name, sub_project_id` (the last three so the frontend can open the real `TaskDetailPanel` and color-code by org).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_me_timeline.py
"""My Timeline: only tasks assigned to the caller, across every org they
belong to — never an org's full backlog just because they're a member."""

from conftest import auth, make_org_with_project, register, login


def test_timeline_only_includes_tasks_assigned_to_me(client):
    ctx = make_org_with_project(client, "tl-owner@test.com")
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"

    owner_id = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()[0]["user_id"]

    mine = client.post(
        task_url, json={"title": "assigned to me", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(ctx["token"]),
    ).json()
    client.post(
        task_url, json={"title": "unassigned", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    )

    res = client.get("/api/me/timeline", headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = res.json()
    titles = [t["title"] for t in body["tasks"]]
    assert "assigned to me" in titles
    assert "unassigned" not in titles
    mine_entry = next(t for t in body["tasks"] if t["id"] == mine["id"])
    assert mine_entry["organization_id"] == ctx["org_id"]
    assert mine_entry["project_id"] == ctx["project_id"]
    assert mine_entry["sub_project_id"] == ctx["sub_id"]


def test_timeline_spans_multiple_orgs(client):
    ctx_a = make_org_with_project(client, "tl-multi@test.com")
    owner_id = client.get(f"/api/orgs/{ctx_a['org_id']}/members", headers=auth(ctx_a["token"])).json()[0]["user_id"]
    task_url_a = f"/api/orgs/{ctx_a['org_id']}/projects/{ctx_a['project_id']}/tasks/{ctx_a['sub_id']}"
    client.post(
        task_url_a, json={"title": "org A task", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(ctx_a["token"]),
    )

    org_b = client.post("/api/orgs", json={"name": "Org B"}, headers=auth(ctx_a["token"])).json()
    token_b = login(client, "tl-multi@test.com")
    project_b = client.post(
        f"/api/orgs/{org_b['id']}/projects", json={"name": "PB", "status": "active"}, headers=auth(token_b)
    ).json()
    sub_b = client.post(
        f"/api/orgs/{org_b['id']}/projects/{project_b['id']}/sub-projects",
        json={"name": "SB", "status": "active"}, headers=auth(token_b),
    ).json()
    task_url_b = f"/api/orgs/{org_b['id']}/projects/{project_b['id']}/tasks/{sub_b['id']}"
    client.post(
        task_url_b, json={"title": "org B task", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(token_b),
    )

    res = client.get("/api/me/timeline", headers=auth(token_b))
    titles = {t["title"] for t in res.json()["tasks"]}
    assert titles == {"org A task", "org B task"}


def test_timeline_requires_auth(client):
    res = client.get("/api/me/timeline")
    assert res.status_code in (401, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_me_timeline.py -v`
Expected: FAIL (404, route doesn't exist)

- [ ] **Step 3: Add the schemas**

In `backend/schemas.py`:

```python
class MyTimelineTask(BaseModel):
    id: int
    title: str
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    story_points: Optional[int] = None
    organization_id: int
    organization_name: str
    project_id: int
    project_name: str
    sub_project_id: int

class MyTimelineSprint(BaseModel):
    id: int
    name: str
    start_date: datetime
    end_date: datetime
    organization_id: int
    organization_name: str

class MyTimelineResponse(BaseModel):
    tasks: List[MyTimelineTask]
    sprints: List[MyTimelineSprint]
```

- [ ] **Step 4: Implement the endpoint**

In `backend/routers/me.py`, add imports and the route:

```python
from schemas import MyOrgResponse, MyTimelineResponse, MyTimelineTask, MyTimelineSprint
from models import (
    Organization, OrganizationMember, Task, SubProject, Project,
    Sprint, SprintTask,
)
```

```python
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
```

Before writing this, check `backend/models.py`'s `Sprint` class for its actual
foreign key to `Project` (the spec draft assumed `Sprint.project_id` — confirm
the exact column name with `grep -n "class Sprint" -A 20 backend/models.py`
and adjust the join above if it differs).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_me_timeline.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && pytest -q`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/routers/me.py backend/schemas.py backend/tests/test_me_timeline.py
git commit -m "feat(backend): add GET /api/me/timeline (assignee-based cross-org aggregation)"
```

---

## Task 8: `GET /api/me/controlled-scopes`

**Files:**
- Modify: `backend/routers/me.py`
- Modify: `backend/schemas.py`
- Test: `backend/tests/test_me_controlled_scopes.py`

**Interfaces:**
- Produces: `GET /api/me/controlled-scopes` → `List[ControlledOrgScope]`, each `{org_id, org_name, projects: [{id, name}]}`, restricted to orgs where the caller's role is `owner` or `admin` — this is what populates the invite dialog's scope dropdown so a user can only grant access to something they control.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_me_controlled_scopes.py
"""Controlled scopes: only orgs where I'm owner/admin, with their projects —
this is what the invite dialog's scope dropdown is restricted to."""

from conftest import auth, make_org_with_project, register, login


def test_controlled_scopes_excludes_orgs_where_i_am_only_a_member(client):
    ctx = make_org_with_project(client, "cs-owner@test.com")
    register(client, "cs-member@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "cs-member@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    member_token = login(client, "cs-member@test.com")

    res = client.get("/api/me/controlled-scopes", headers=auth(member_token))
    assert res.status_code == 200
    assert res.json() == []


def test_controlled_scopes_includes_owned_org_and_its_projects(client):
    ctx = make_org_with_project(client, "cs-owner2@test.com")
    res = client.get("/api/me/controlled-scopes", headers=auth(ctx["token"]))
    body = res.json()
    assert len(body) == 1
    assert body[0]["org_id"] == ctx["org_id"]
    assert any(p["id"] == ctx["project_id"] for p in body[0]["projects"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_me_controlled_scopes.py -v`
Expected: FAIL (404)

- [ ] **Step 3: Add the schema**

In `backend/schemas.py`:

```python
class ControlledProject(BaseModel):
    id: int
    name: str

class ControlledOrgScope(BaseModel):
    org_id: int
    org_name: str
    projects: List[ControlledProject]
```

- [ ] **Step 4: Implement the endpoint**

In `backend/routers/me.py`:

```python
from schemas import (
    MyOrgResponse, MyTimelineResponse, MyTimelineTask, MyTimelineSprint,
    ControlledOrgScope, ControlledProject,
)
```

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_me_controlled_scopes.py -v`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && pytest -q`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add backend/routers/me.py backend/schemas.py backend/tests/test_me_controlled_scopes.py
git commit -m "feat(backend): add GET /api/me/controlled-scopes for the invite scope dropdown"
```

---

## Task 9: Frontend — My Organizations tab

**Files:**
- Create: `frontend/src/pages/MyOrganizationsPage.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: `GET /api/me/orgs`, `PATCH /api/orgs/{id}`, `DELETE /api/orgs/{id}/members/me`, `useOrg()` (`switchOrg`, `createOrg` — both already exist in `OrgContext.jsx`).

- [ ] **Step 1: Add the sidebar entry**

In `frontend/src/components/Sidebar.jsx`, add `Building2` to the `lucide-react`
import and a new tab entry right after `'settings'` in the `tabs` array (or
wherever reads best — this is a global, not per-org, view, so put it first):

```js
import { CheckSquare, Folder, Heart, Clock, Lightbulb, Compass, Users, BarChart3, GanttChartSquare, Rocket, CalendarDays, Settings, Building2, User } from 'lucide-react'

const tabs = [
  { id: 'my-orgs', label: 'My Organizations', icon: Building2 },
  { id: 'my-timeline', label: 'My Timeline', icon: User },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  ...
```

(Leave the rest of the array exactly as it is — only these two entries are
new, inserted at the top.)

- [ ] **Step 2: Build the page component**

```jsx
// frontend/src/pages/MyOrganizationsPage.jsx
import { useState, useEffect } from 'react'
import { Building2, ArrowRight, Pencil, LogOut, Plus } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

export default function MyOrganizationsPage({ onSwitched }) {
  const { switchOrg, createOrg } = useOrg()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [newOrgName, setNewOrgName] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/me/orgs')
      setOrgs(res.data)
    } catch {
      setError('Could not load your organizations.')
    }
    setLoading(false)
  }

  const handleSwitch = async (orgId) => {
    await switchOrg(orgId)
    onSwitched?.()
  }

  const startRename = (org) => {
    setRenamingId(org.id)
    setRenameValue(org.name)
  }

  const saveRename = async (orgId) => {
    try {
      await api.patch(`/api/orgs/${orgId}`, { name: renameValue })
      setRenamingId(null)
      await load()
    } catch {
      setError('Could not rename that organization.')
    }
  }

  const leave = async (orgId) => {
    try {
      await api.delete(`/api/orgs/${orgId}/members/me`)
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not leave that organization.')
    }
  }

  const handleCreate = async () => {
    if (!newOrgName.trim()) return
    await createOrg(newOrgName)
    setNewOrgName('')
    await load()
  }

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-brand-400" />
          <h2 className="text-xl font-bold text-white">My Organizations</h2>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
              <div className="flex-1 min-w-0">
                {renamingId === org.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(org.id)}
                    className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm w-full"
                  />
                ) : (
                  <p className="text-white font-medium truncate">{org.name}</p>
                )}
                <p className="text-xs text-slate-400 capitalize">{org.role} &middot; {org.member_count} member{org.member_count === 1 ? '' : 's'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {renamingId === org.id ? (
                  <button onClick={() => saveRename(org.id)} className="px-2 py-1 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded">Save</button>
                ) : (
                  (org.role === 'owner' || org.role === 'admin') && (
                    <button onClick={() => startRename(org)} aria-label={`Rename ${org.name}`} className="p-1.5 hover:bg-slate-700 rounded text-slate-300">
                      <Pencil size={16} />
                    </button>
                  )
                )}
                <button onClick={() => leave(org.id)} aria-label={`Leave ${org.name}`} className="p-1.5 hover:bg-red-500/20 rounded text-red-400">
                  <LogOut size={16} />
                </button>
                <button onClick={() => handleSwitch(org.id)} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded flex items-center gap-1">
                  Open <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
          {orgs.length === 0 && <p className="text-sm text-slate-400">You don't belong to any organizations yet.</p>}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus size={18} className="text-brand-400" />
          <h2 className="text-xl font-bold text-white">Create a new organization</h2>
        </div>
        <div className="flex gap-2">
          <input
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Organization name..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500"
          />
          <button onClick={handleCreate} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg">
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire it into `DashboardPage.jsx`**

Add the import and tab title:

```js
import MyOrganizationsPage from './MyOrganizationsPage'
```

```js
const TAB_TITLES = {
  'my-orgs': 'My Organizations',
  'my-timeline': 'My Timeline',
  tasks: 'Tasks',
  ...
```

Add the render branch (place it right after the opening of the tab-content
area, before the Tasks tab block — it doesn't need `currentOrg` to render, but
this file already gated the whole return on `if (!currentOrg) return <Loading>`
above, so this branch will only render once the user has at least one org,
which is fine since a user with zero orgs is shown the "create your first
org" modal already):

```jsx
{activeTab === 'my-orgs' && (
  <MyOrganizationsPage onSwitched={() => setActiveTab('tasks')} />
)}
```

- [ ] **Step 4: Manual verification (no frontend test harness in this repo — follow the project's existing pattern of pytest for backend, manual browser check for frontend)**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add frontend/src/pages/MyOrganizationsPage.jsx frontend/src/components/Sidebar.jsx frontend/src/pages/DashboardPage.jsx
git commit -m "feat(frontend): add My Organizations hub tab"
```

---

## Task 10: Frontend — My Timeline tab

**Files:**
- Create: `frontend/src/pages/MyTimelinePage.jsx`
- Modify: `frontend/src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: `GET /api/me/timeline` (Task 7), existing `TaskDetailPanel` component (props: `orgId, projectId, subProjectId, task, members, onClose, onTaskUpdate`).

- [ ] **Step 1: Build the page**

This reuses the month-grid logic from `CalendarView.jsx` almost verbatim
(`buildMonthGrid`, `isSameDay`, `dayKey`) but sources its data from
`/api/me/timeline` instead of a single org, and color-codes by
`organization_name` instead of priority:

```jsx
// frontend/src/pages/MyTimelinePage.jsx
import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../utils/api'
import TaskDetailPanel from '../components/TaskDetailPanel'

const ORG_COLORS = [
  'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'bg-purple-500/20 text-purple-300 border-purple-500/40',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'bg-amber-500/20 text-amber-300 border-amber-500/40',
  'bg-pink-500/20 text-pink-300 border-pink-500/40',
]

function colorForOrg(orgId, orgIdOrder) {
  const idx = orgIdOrder.indexOf(orgId)
  return ORG_COLORS[idx % ORG_COLORS.length]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)
  const days = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return days
}

export default function MyTimelinePage() {
  const [tasks, setTasks] = useState([])
  const [sprints, setSprints] = useState([])
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [openTask, setOpenTask] = useState(null)
  const [openTaskMembers, setOpenTaskMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/me/timeline')
      setTasks(res.data.tasks)
      setSprints(res.data.sprints)
    } catch {
      setError('Could not load your timeline.')
    }
    setLoading(false)
  }

  const orgIdOrder = useMemo(
    () => [...new Set(tasks.map((t) => t.organization_id))],
    [tasks]
  )

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const today = new Date()

  const tasksByDay = useMemo(() => {
    const map = new Map()
    for (const task of tasks) {
      if (!task.due_date) continue
      const d = new Date(task.due_date)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(task)
    }
    return map
  }, [tasks])

  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  const goPrev = () => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))
  const goNext = () => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))
  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() })

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const handleOpenTask = async (task) => {
    setOpenTask(task)
    try {
      const res = await api.get(`/api/orgs/${task.organization_id}/members`)
      setOpenTaskMembers(res.data)
    } catch {
      setOpenTaskMembers([])
    }
  }

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">{error}</p>
      )}

      {sprints.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Active sprints touching your tasks</h3>
          <div className="space-y-1">
            {sprints.map((s) => (
              <div key={s.id} className="text-xs text-slate-300 flex justify-between">
                <span>{s.name} <span className="text-slate-500">({s.organization_name})</span></span>
                <span className="text-slate-500">
                  {new Date(s.start_date).toLocaleDateString()} &ndash; {new Date(s.end_date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} aria-label="Previous month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300"><ChevronLeft size={18} /></button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">Today</button>
            <button onClick={goNext} aria-label="Next month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800 text-xs text-slate-500 mb-1">
          {WEEKDAYS.map((w) => <div key={w} className="text-center py-1">{w}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
          {days.map((d) => {
            const inMonth = d.getMonth() === cursor.month
            const dayTasks = tasksByDay.get(dayKey(d)) || []
            return (
              <div key={d.toISOString()} className={`min-h-[6rem] p-1.5 ${inMonth ? 'bg-slate-900' : 'bg-slate-900/40'}`}>
                <span className={`text-xs inline-flex items-center justify-center w-5 h-5 rounded-full ${isSameDay(d, today) ? 'bg-brand-500 text-white font-semibold' : inMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleOpenTask(t)}
                      title={`${t.title} (${t.organization_name})`}
                      className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 rounded border truncate ${colorForOrg(t.organization_id, orgIdOrder)}`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && <p className="text-[10px] text-slate-500 px-1">+{dayTasks.length - 3} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {openTask && (
        <TaskDetailPanel
          orgId={openTask.organization_id}
          projectId={openTask.project_id}
          subProjectId={openTask.sub_project_id}
          task={openTask}
          members={openTaskMembers}
          onClose={() => setOpenTask(null)}
          onTaskUpdate={() => { setOpenTask(null); load() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `DashboardPage.jsx`**

```js
import MyTimelinePage from './MyTimelinePage'
```

```jsx
{activeTab === 'my-timeline' && (
  <MyTimelinePage />
)}
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npm run build`
Expected: succeeds

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add frontend/src/pages/MyTimelinePage.jsx frontend/src/pages/DashboardPage.jsx
git commit -m "feat(frontend): add My Timeline tab (assignee-based cross-org calendar)"
```

---

## Task 11: Frontend — invite form scope + role + temp-password display

**Files:**
- Modify: `frontend/src/components/MemberManager.jsx`

**Interfaces:**
- Consumes: `GET /api/me/controlled-scopes` (Task 8), `POST /api/orgs/{org_id}/members` (now returns `temporary_password`, Task 5), `POST /api/orgs/{org_id}/projects/{project_id}/members` (Task 4).

- [ ] **Step 1: Add scope state and the controlled-scopes fetch**

Near the top of the component (after the existing `useState` calls, around
line 22 following `const sensitiveAction = useSensitiveAction()`):

```js
const [scopes, setScopes] = useState([])
const [scopeKey, setScopeKey] = useState('org') // 'org' or `project:<id>`
const [tempPassword, setTempPassword] = useState('')
```

Add `PROJECT_INVITABLE_ROLES` next to the existing `INVITABLE_ROLES` constant:

```js
const PROJECT_INVITABLE_ROLES = ['viewer', 'editor']
```

In the existing `load()` function, fetch scopes alongside members/invites:

```js
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/members`)
      setMembers(res.data)
    } catch {
      setError('Could not load the people in this organisation.')
    }
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/invites`)
      setInvites(res.data)
    } catch {
      setInvites([])
    }
    try {
      const res = await api.get('/api/me/controlled-scopes')
      setScopes(res.data)
    } catch {
      setScopes([])
    }
    setLoading(false)
  }
```

- [ ] **Step 2: Branch `invite()` on scope, capture the temp password**

Replace the existing `invite` function body:

```js
  const invite = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    setError('')
    setNotice('')
    setTempPassword('')
    try {
      let res
      if (scopeKey === 'org') {
        res = await api.post(`/api/orgs/${currentOrg.id}/members`, { email: trimmed, role })
      } else {
        const projectId = scopeKey.split(':')[1]
        res = await api.post(`/api/orgs/${currentOrg.id}/projects/${projectId}/members`, {
          email: trimmed, role,
        })
      }
      setNotice(res.data?.message || `Invitation sent to ${trimmed}.`)
      if (res.data?.temporary_password) setTempPassword(res.data.temporary_password)
      setEmail('')
      await load()
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'Only owners and admins can add people.'
          : err?.response?.data?.detail || 'Could not send the invitation.'
      )
    }
  }
```

- [ ] **Step 3: Add the scope dropdown and switch the role dropdown's options**

In the JSX, right before the existing `<select value={role} ...>` block
(inside "Add someone"), add a scope selector, and make the role `<select>`
switch its option list based on scope:

```jsx
<select
  value={scopeKey}
  onChange={(e) => {
    setScopeKey(e.target.value)
    setRole(e.target.value === 'org' ? 'member' : 'viewer')
  }}
  aria-label="Access scope"
  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-brand-500"
>
  <option value="org">Whole organization</option>
  {scopes.flatMap((s) =>
    s.projects.map((p) => (
      <option key={`${s.org_id}:${p.id}`} value={`project:${p.id}`}>
        Project: {p.name} ({s.org_name})
      </option>
    ))
  )}
</select>
```

Change the existing role `<select>`'s `.map()` source:

```jsx
<select
  value={role}
  onChange={(e) => setRole(e.target.value)}
  aria-label="Role"
  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white capitalize focus:outline-none focus:border-brand-500"
>
  {(scopeKey === 'org' ? INVITABLE_ROLES : PROJECT_INVITABLE_ROLES).map((r) => (
    <option key={r} value={r}>{r}</option>
  ))}
</select>
```

Below the existing `<p className="mt-3 text-xs text-slate-500">{ROLE_LABELS[role]}</p>`
line, only render that role-description line when `scopeKey === 'org'`
(`ROLE_LABELS` has no entries for `viewer`/`editor` project-scope semantics
distinct from org roles — reusing it for project scope would show a
misleading org-level description):

```jsx
{scopeKey === 'org' && <p className="mt-3 text-xs text-slate-500">{ROLE_LABELS[role]}</p>}
```

Add the temp-password banner right after the existing `{notice && (...)}`
block near the top of the component:

```jsx
{tempPassword && (
  <div className="mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/40 rounded-lg text-sm text-amber-200">
    <p className="font-medium mb-1">Temporary password — give this to them now, it won't be shown again:</p>
    <code className="block px-2 py-1 bg-slate-900 rounded font-mono text-amber-100">{tempPassword}</code>
  </div>
)}
```

- [ ] **Step 4: Build check**

Run: `cd frontend && npm run build`
Expected: succeeds

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/projects/project_manager
git add frontend/src/components/MemberManager.jsx
git commit -m "feat(frontend): invite form supports org-or-project scope, role, and shows temp password"
```

---

## Task 12: Full verification and deploy

**Files:** none (verification only)

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && source venv/bin/activate 2>/dev/null; pytest -q`
Expected: all tests pass (88 existing + all new tests from Tasks 1–8)

- [ ] **Step 2: Restart the backend process** so `Base.metadata.create_all` picks up the new `project_members` table against the real production `kaizenpm.db`

Find and restart however the backend is currently run in this environment
(check for a systemd unit or a manually-run `uvicorn`/`python main.py`
process first — do not guess, inspect what's actually running):

Run: `ps aux | grep -i uvicorn` and/or `systemctl status kaizenpm-backend 2>/dev/null`

Then restart via whichever mechanism is actually managing it.

- [ ] **Step 3: curl-verify the new endpoints against the live backend**

Using the current tunnel URL from `frontend/public/config.json` (or
`http://127.0.0.1:8090` directly, since this runs on the same box) and a
fresh CLI token from `pm-cli.py login`, hit `GET /api/me/orgs`,
`GET /api/me/timeline`, `GET /api/me/controlled-scopes` and confirm 200
responses with the expected shape for the real `solatavi@gmail.com` account
and the CIL MT project seeded earlier this session.

- [ ] **Step 4: Frontend build and deploy**

Run: `cd frontend && npm run build`

Deploy however this project's existing deploy step works (check for a
deploy script referenced in `README.md` or a `package.json` script — this
project already has a working GitHub Pages deploy pipeline from earlier in
this session; reuse it exactly, don't invent a new one).

- [ ] **Step 5: Real browser verification**

Using Playwright (as used earlier in this session for the CIL project
verification), log in as an existing test account against the live
deployed URL, navigate to the My Organizations tab and confirm the org
list renders, navigate to My Timeline and confirm it renders (even if
empty), and exercise one invite (org-scope) end-to-end including reading
the temp-password banner. Screenshot each step. Do not report this task
done without pasting the actual observed output/screenshots — per this
project's standing verification requirement, a build succeeding is not
evidence a feature works.

- [ ] **Step 6: Final commit if any deploy-config files changed**

```bash
cd /home/ubuntu/projects/project_manager
git status
git add -A
git commit -m "chore: redeploy after cross-org view feature"
```

(Only run this if `git status` actually shows changes beyond what Tasks
1–11 already committed — e.g. a rotated tunnel URL in `config.json` picked
up incidentally during verification.)
