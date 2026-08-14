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
