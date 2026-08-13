"""In-app notifications: task assignment, comments, invites, and isolation."""

from conftest import auth, login, register


def _setup_owner_and_assignee(client, tag):
    owner_email = f"nowner{tag}@test.com"
    assignee_email = f"nassignee{tag}@test.com"
    register(client, owner_email)
    owner_token = login(client, owner_email)
    org = client.post("/api/orgs", json={"name": "N Org"}, headers=auth(owner_token)).json()
    owner_token = login(client, owner_email)  # re-scope

    register(client, assignee_email)
    assignee_token = login(client, assignee_email)

    add = client.post(
        f"/api/orgs/{org['id']}/members",
        json={"email": assignee_email, "role": "member"},
        headers=auth(owner_token),
    )
    assert add.status_code == 200
    assignee_token = login(client, assignee_email)  # re-scope after joining

    members = client.get(f"/api/orgs/{org['id']}/members", headers=auth(owner_token)).json()
    assignee_id = next(m["user_id"] for m in members if m["user"]["email"] == assignee_email)

    project = client.post(
        f"/api/orgs/{org['id']}/projects",
        json={"name": "P", "status": "active"},
        headers=auth(owner_token),
    ).json()
    sub = client.post(
        f"/api/orgs/{org['id']}/projects/{project['id']}/sub-projects",
        json={"name": "S", "status": "active"},
        headers=auth(owner_token),
    ).json()

    return {
        "org_id": org["id"],
        "project_id": project["id"],
        "sub_id": sub["id"],
        "owner_token": owner_token,
        "assignee_token": assignee_token,
        "assignee_id": assignee_id,
    }


def test_invite_notifies_an_existing_user(client):
    ctx = _setup_owner_and_assignee(client, "1")
    unread = client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()
    assert len(unread) == 1
    assert unread[0]["type"] == "invite_received"


def test_task_assignment_notifies_the_assignee(client):
    ctx = _setup_owner_and_assignee(client, "2")
    client.post("/api/notifications/read-all", headers=auth(ctx["assignee_token"]))

    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    client.post(
        task_url,
        json={"title": "Do the thing", "status": "todo", "priority": "high", "assignee_id": ctx["assignee_id"]},
        headers=auth(ctx["owner_token"]),
    )
    unread = client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()
    assert len(unread) == 1
    assert unread[0]["type"] == "task_assigned"


def test_comment_notifies_the_assignee_but_not_the_commenter(client):
    ctx = _setup_owner_and_assignee(client, "3")
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    task = client.post(
        task_url,
        json={"title": "T", "status": "todo", "priority": "high", "assignee_id": ctx["assignee_id"]},
        headers=auth(ctx["owner_token"]),
    ).json()
    client.post("/api/notifications/read-all", headers=auth(ctx["assignee_token"]))

    comments_url = f"{task_url}/{task['id']}/comments"

    # Owner comments -> assignee gets a notification.
    client.post(comments_url, json={"content": "hi"}, headers=auth(ctx["owner_token"]))
    unread = client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()
    assert len(unread) == 1
    assert unread[0]["type"] == "comment_added"

    # Assignee comments on their own task -> no self-notification.
    client.post(comments_url, json={"content": "on it"}, headers=auth(ctx["assignee_token"]))
    unread_after = client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()
    assert len(unread_after) == 1  # unchanged


def test_mark_read_and_mark_all_read(client):
    ctx = _setup_owner_and_assignee(client, "4")
    unread = client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()
    assert len(unread) == 1

    res = client.post(f"/api/notifications/{unread[0]['id']}/read", headers=auth(ctx["assignee_token"]))
    assert res.status_code == 200
    assert client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json() == []

    # Generate a couple more, then mark-all-read.
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    client.post(
        task_url,
        json={"title": "T2", "status": "todo", "priority": "low", "assignee_id": ctx["assignee_id"]},
        headers=auth(ctx["owner_token"]),
    )
    assert len(client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()) == 1

    res = client.post("/api/notifications/read-all", headers=auth(ctx["assignee_token"]))
    assert res.status_code == 200
    assert client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json() == []


def test_notifications_are_isolated_per_user(client):
    ctx = _setup_owner_and_assignee(client, "5")
    # Owner never got assigned or commented at, so should have none.
    owner_unread = client.get("/api/notifications", headers=auth(ctx["owner_token"])).json()
    assert owner_unread == []

    assignee_unread = client.get("/api/notifications", headers=auth(ctx["assignee_token"])).json()
    notif_id = assignee_unread[0]["id"]

    res = client.post(f"/api/notifications/{notif_id}/read", headers=auth(ctx["owner_token"]))
    assert res.status_code == 404


def test_notifications_require_auth(client):
    assert client.get("/api/notifications").status_code == 403
