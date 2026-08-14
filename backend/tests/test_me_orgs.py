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
