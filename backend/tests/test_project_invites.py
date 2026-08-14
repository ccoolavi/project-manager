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
