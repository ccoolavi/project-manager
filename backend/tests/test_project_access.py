"""require_project_access: org members always pass; ProjectMember grants a
narrow, project-scoped fallback; neither means a hard 403."""

import pytest
from fastapi import HTTPException

from conftest import auth, make_org_with_project, register, login
from database import get_db
from main import app
from models import ProjectMember, ProjectRole, User
from utils.tenancy import require_project_access


def _db():
    return next(app.dependency_overrides[get_db]())


def test_org_member_always_has_access(client):
    ctx = make_org_with_project(client, "rpa-org@test.com")
    db = _db()
    owner = db.query(User).filter(User.email == "rpa-org@test.com").first()
    result = require_project_access(db, ctx["org_id"], ctx["project_id"], owner.id)
    assert result is not None
    db.close()


def test_non_member_without_grant_is_denied(client):
    ctx = make_org_with_project(client, "rpa-a@test.com")
    make_org_with_project(client, "rpa-b@test.com")
    db = _db()
    outsider = db.query(User).filter(User.email == "rpa-b@test.com").first()
    with pytest.raises(HTTPException) as exc:
        require_project_access(db, ctx["org_id"], ctx["project_id"], outsider.id)
    assert exc.value.status_code == 403
    db.close()


def test_project_viewer_gets_view_but_not_edit(client):
    ctx = make_org_with_project(client, "rpa-c@test.com")
    register(client, "rpa-viewer@test.com")
    login(client, "rpa-viewer@test.com")
    db = _db()
    viewer = db.query(User).filter(User.email == "rpa-viewer@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=viewer.id, role=ProjectRole.viewer))
    db.commit()

    result = require_project_access(db, ctx["org_id"], ctx["project_id"], viewer.id, need_edit=False)
    assert result is not None

    with pytest.raises(HTTPException) as exc:
        require_project_access(db, ctx["org_id"], ctx["project_id"], viewer.id, need_edit=True)
    assert exc.value.status_code == 403
    db.close()


def test_project_editor_gets_edit(client):
    ctx = make_org_with_project(client, "rpa-d@test.com")
    register(client, "rpa-editor@test.com")
    login(client, "rpa-editor@test.com")
    db = _db()
    editor = db.query(User).filter(User.email == "rpa-editor@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=editor.id, role=ProjectRole.editor))
    db.commit()

    result = require_project_access(db, ctx["org_id"], ctx["project_id"], editor.id, need_edit=True)
    assert result is not None
    db.close()


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
