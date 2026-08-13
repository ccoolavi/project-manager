"""Authentication, role scoping and multi-tenant isolation.

The isolation tests here encode the specific defect that shipped to production:
membership was checked against the org id in the path, but the object being
addressed was never proved to belong to that org, so any member of any
organisation could read or delete another organisation's tasks by id.
"""

from conftest import auth, login, make_org_with_project, register


def test_register_returns_a_token(client):
    token = register(client, "solo@test.com")
    assert token


def test_duplicate_email_is_rejected(client):
    register(client, "dupe@test.com")
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Other",
            "email": "dupe@test.com",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
        },
    )
    assert res.status_code == 409


def test_mismatched_passwords_are_rejected(client):
    res = client.post(
        "/api/auth/register",
        json={
            "name": "X",
            "email": "mismatch@test.com",
            "password": "TestPass123",
            "confirm_password": "Different123",
        },
    )
    assert res.status_code == 400


def test_wrong_password_is_rejected(client):
    register(client, "pw@test.com")
    res = client.post(
        "/api/auth/login", json={"email": "pw@test.com", "password": "WrongPass123"}
    )
    assert res.status_code == 401


def test_long_password_does_not_crash_bcrypt(client):
    """bcrypt only accepts 72 bytes; passlib used to raise instead of truncating."""
    long_password = "A" * 200
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Long",
            "email": "long@test.com",
            "password": long_password,
            "confirm_password": long_password,
        },
    )
    assert res.status_code == 200
    res = client.post(
        "/api/auth/login", json={"email": "long@test.com", "password": long_password}
    )
    assert res.status_code == 200


def test_unauthenticated_requests_are_rejected(client):
    assert client.get("/api/orgs").status_code == 403


def test_refresh_scopes_the_token_to_the_requested_org(client):
    register(client, "multi@test.com")
    token = login(client, "multi@test.com")
    a = client.post("/api/orgs", json={"name": "A"}, headers=auth(token)).json()
    b = client.post("/api/orgs", json={"name": "B"}, headers=auth(token)).json()

    scoped = client.post(
        f"/api/auth/refresh?org_id={b['id']}", headers=auth(token)
    ).json()["access_token"]

    # The scoped token must let us work inside B.
    res = client.post(
        f"/api/orgs/{b['id']}/projects",
        json={"name": "In B", "status": "active"},
        headers=auth(scoped),
    )
    assert res.status_code == 200
    assert a["id"] != b["id"]


def test_refresh_rejects_an_org_you_do_not_belong_to(client):
    outsider = make_org_with_project(client, "outsider@test.com")
    register(client, "stranger@test.com")
    stranger = login(client, "stranger@test.com")

    res = client.post(
        f"/api/auth/refresh?org_id={outsider['org_id']}", headers=auth(stranger)
    )
    assert res.status_code == 403


def test_members_of_other_orgs_cannot_list_projects(client):
    alice = make_org_with_project(client, "alice@test.com")
    bob = make_org_with_project(client, "bob@test.com")

    res = client.get(f"/api/orgs/{alice['org_id']}/projects", headers=auth(bob["token"]))
    assert res.status_code == 403


def test_cross_org_task_read_is_blocked(client):
    """The exact leak: Bob's own org id combined with Alice's sub-project id."""
    alice = make_org_with_project(client, "alice2@test.com")
    bob = make_org_with_project(client, "bob2@test.com")

    client.post(
        f"/api/orgs/{alice['org_id']}/projects/{alice['project_id']}/tasks/{alice['sub_id']}",
        json={"title": "Secret", "status": "todo", "priority": "high"},
        headers=auth(alice["token"]),
    )

    res = client.get(
        f"/api/orgs/{bob['org_id']}/projects/{alice['project_id']}/tasks/{alice['sub_id']}",
        headers=auth(bob["token"]),
    )
    assert res.status_code == 404


def test_cross_org_task_delete_is_blocked(client):
    alice = make_org_with_project(client, "alice3@test.com")
    bob = make_org_with_project(client, "bob3@test.com")

    task = client.post(
        f"/api/orgs/{alice['org_id']}/projects/{alice['project_id']}/tasks/{alice['sub_id']}",
        json={"title": "Secret", "status": "todo", "priority": "high"},
        headers=auth(alice["token"]),
    ).json()

    res = client.delete(
        f"/api/orgs/{bob['org_id']}/projects/{alice['project_id']}/tasks/{alice['sub_id']}/{task['id']}",
        headers=auth(bob["token"]),
    )
    assert res.status_code == 404

    # And the task is still there for its rightful owner.
    still = client.get(
        f"/api/orgs/{alice['org_id']}/projects/{alice['project_id']}/tasks/{alice['sub_id']}",
        headers=auth(alice["token"]),
    ).json()
    assert len(still) == 1


def test_cross_org_sub_project_listing_is_blocked(client):
    alice = make_org_with_project(client, "alice4@test.com")
    bob = make_org_with_project(client, "bob4@test.com")

    res = client.get(
        f"/api/orgs/{bob['org_id']}/projects/{alice['project_id']}/sub-projects",
        headers=auth(bob["token"]),
    )
    assert res.status_code == 404


def test_personal_data_does_not_bleed_between_users(client):
    alice = make_org_with_project(client, "alice5@test.com")
    bob = make_org_with_project(client, "bob5@test.com")

    client.post(
        f"/api/orgs/{alice['org_id']}/kaizen",
        json={"title": "Mine", "problem": "p", "solution": "s"},
        headers=auth(alice["token"]),
    )
    assert client.get(
        f"/api/orgs/{bob['org_id']}/kaizen", headers=auth(bob["token"])
    ).json() == []
