from conftest import register, login, auth, make_org_with_project


def _add_member(client, org_id, owner_token, email, role="member"):
    register(client, email)
    res = client.post(
        f"/api/orgs/{org_id}/members",
        json={"email": email, "role": role},
        headers=auth(owner_token),
    )
    assert res.status_code == 200, res.text
    members = client.get(f"/api/orgs/{org_id}/members", headers=auth(owner_token)).json()
    return next(m for m in members if m["user"]["email"] == email)


def test_owner_can_change_a_members_role(client):
    ctx = make_org_with_project(client, "owner@example.com")
    member = _add_member(client, ctx["org_id"], ctx["token"], "member@example.com", role="viewer")

    res = client.patch(
        f"/api/orgs/{ctx['org_id']}/members/{member['id']}",
        json={"role": "editor"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200, res.text
    assert res.json()["role"] == "editor"


def test_admin_cannot_grant_owner_role(client):
    ctx = make_org_with_project(client, "owner2@example.com")
    admin = _add_member(client, ctx["org_id"], ctx["token"], "admin2@example.com", role="admin")
    member = _add_member(client, ctx["org_id"], ctx["token"], "member2@example.com", role="viewer")
    admin_token = login(client, "admin2@example.com")

    res = client.patch(
        f"/api/orgs/{ctx['org_id']}/members/{member['id']}",
        json={"role": "owner"},
        headers=auth(admin_token),
    )
    assert res.status_code == 403


def test_cannot_demote_the_last_owner_while_others_remain(client):
    ctx = make_org_with_project(client, "owner3@example.com")
    members = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
    owner_member = next(m for m in members if m["role"] == "owner")
    _add_member(client, ctx["org_id"], ctx["token"], "member3@example.com", role="viewer")

    res = client.patch(
        f"/api/orgs/{ctx['org_id']}/members/{owner_member['id']}",
        json={"role": "admin"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 400


def test_non_admin_cannot_change_roles(client):
    ctx = make_org_with_project(client, "owner4@example.com")
    member = _add_member(client, ctx["org_id"], ctx["token"], "member4@example.com", role="viewer")
    member_token = login(client, "member4@example.com")

    res = client.patch(
        f"/api/orgs/{ctx['org_id']}/members/{member['id']}",
        json={"role": "editor"},
        headers=auth(member_token),
    )
    assert res.status_code == 403


def test_project_access_list_and_revoke(client):
    ctx = make_org_with_project(client, "owner5@example.com")

    res = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/members",
        json={"email": "viewer5@example.com", "role": "viewer"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200, res.text

    listing = client.get(f"/api/orgs/{ctx['org_id']}/project-access", headers=auth(ctx["token"]))
    assert listing.status_code == 200
    grants = listing.json()
    assert len(grants) == 1
    assert grants[0]["user"]["email"] == "viewer5@example.com"
    assert grants[0]["project_id"] == ctx["project_id"]

    revoke = client.delete(
        f"/api/orgs/{ctx['org_id']}/project-access/{grants[0]['id']}",
        headers=auth(ctx["token"]),
    )
    assert revoke.status_code == 200

    listing_after = client.get(f"/api/orgs/{ctx['org_id']}/project-access", headers=auth(ctx["token"]))
    assert listing_after.json() == []


def test_non_admin_cannot_view_project_access(client):
    ctx = make_org_with_project(client, "owner6@example.com")
    _add_member(client, ctx["org_id"], ctx["token"], "member6@example.com", role="viewer")
    member_token = login(client, "member6@example.com")

    res = client.get(f"/api/orgs/{ctx['org_id']}/project-access", headers=auth(member_token))
    assert res.status_code == 403
