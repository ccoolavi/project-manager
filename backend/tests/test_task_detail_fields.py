"""story_points and start_date: creation, update, bounds, and response shape."""

from conftest import auth, make_org_with_project


def _task_url(ctx, task_id=""):
    base = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    return f"{base}/{task_id}" if task_id else base


def test_create_task_with_story_points_and_dates(client):
    ctx = make_org_with_project(client, "b4a@test.com")
    res = client.post(
        _task_url(ctx),
        json={
            "title": "T",
            "status": "todo",
            "priority": "high",
            "story_points": 5,
            "start_date": "2026-08-01T00:00:00",
            "due_date": "2026-08-10T00:00:00",
        },
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["story_points"] == 5
    assert body["start_date"].startswith("2026-08-01")
    assert body["due_date"].startswith("2026-08-10")


def test_task_without_story_points_defaults_to_zero(client):
    ctx = make_org_with_project(client, "b4b@test.com")
    res = client.post(
        _task_url(ctx), json={"title": "T", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
    )
    assert res.json()["story_points"] == 0


def test_update_story_points_and_start_date(client):
    ctx = make_org_with_project(client, "b4c@test.com")
    task = client.post(
        _task_url(ctx), json={"title": "T", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
    ).json()

    res = client.put(
        _task_url(ctx, task["id"]),
        json={"story_points": 8, "start_date": "2026-09-01T00:00:00"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["story_points"] == 8
    assert body["start_date"].startswith("2026-09-01")


def test_story_points_out_of_range_rejected(client):
    ctx = make_org_with_project(client, "b4d@test.com")
    task = client.post(
        _task_url(ctx), json={"title": "T", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
    ).json()

    too_high = client.put(_task_url(ctx, task["id"]), json={"story_points": 14}, headers=auth(ctx["token"]))
    assert too_high.status_code == 422

    too_low = client.put(_task_url(ctx, task["id"]), json={"story_points": 0}, headers=auth(ctx["token"]))
    assert too_low.status_code == 422


def test_reassigning_a_task_via_put_notifies_the_new_assignee(client):
    """Same trigger tasks.py already has for create_task's assignee_id; this
    confirms update_task's assignee_change branch fires it too."""
    from conftest import login, register

    ctx = make_org_with_project(client, "b4e@test.com")
    register(client, "b4e-assignee@test.com")
    assignee_token = login(client, "b4e-assignee@test.com")

    add = client.post(
        f"/api/orgs/{ctx['org_id']}/members",
        json={"email": "b4e-assignee@test.com", "role": "member"},
        headers=auth(ctx["token"]),
    )
    assert add.status_code == 200
    assignee_token = login(client, "b4e-assignee@test.com")

    members = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
    assignee_id = next(m["user_id"] for m in members if m["user"]["email"] == "b4e-assignee@test.com")

    task = client.post(
        _task_url(ctx), json={"title": "T", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
    ).json()
    client.post("/api/notifications/read-all", headers=auth(assignee_token))

    client.put(_task_url(ctx, task["id"]), json={"assignee_id": assignee_id}, headers=auth(ctx["token"]))

    unread = client.get("/api/notifications", headers=auth(assignee_token)).json()
    assert len(unread) == 1
    assert unread[0]["type"] == "task_assigned"
