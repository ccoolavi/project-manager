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
