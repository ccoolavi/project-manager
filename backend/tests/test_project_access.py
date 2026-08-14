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
    result = require_project_access(db, ctx["project_id"], owner.id)
    assert result is not None
    db.close()


def test_non_member_without_grant_is_denied(client):
    ctx = make_org_with_project(client, "rpa-a@test.com")
    make_org_with_project(client, "rpa-b@test.com")
    db = _db()
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
    editor = db.query(User).filter(User.email == "rpa-editor@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=editor.id, role=ProjectRole.editor))
    db.commit()

    result = require_project_access(db, ctx["project_id"], editor.id, need_edit=True)
    assert result is not None
    db.close()
