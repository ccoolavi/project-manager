"""ProjectMember grants project-scoped access without touching org membership."""

from conftest import auth, make_org_with_project, register, login


def test_project_member_row_created_directly(client):
    ctx = make_org_with_project(client, "pm-model@test.com")
    register(client, "viewer-model@test.com")
    login(client, "viewer-model@test.com")

    from database import get_db
    from main import app
    from models import ProjectMember, ProjectRole, User

    db = next(app.dependency_overrides[get_db]())
    viewer = db.query(User).filter(User.email == "viewer-model@test.com").first()
    member = ProjectMember(
        project_id=ctx["project_id"],
        user_id=viewer.id,
        role=ProjectRole.viewer,
        invited_by=viewer.id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    assert member.id is not None
    assert member.role == ProjectRole.viewer
    db.close()
