"""Sprint planning: task assignment to a sprint, points, and burndown."""

from datetime import datetime, timedelta

from conftest import auth, make_org_with_project


def _sprint_url(ctx, sprint_id=""):
    base = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/sprints"
    return f"{base}/{sprint_id}" if sprint_id else base


def _create_sprint(client, ctx, days=13):
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=days)
    return client.post(
        _sprint_url(ctx),
        json={"name": "Sprint 1", "goal": "Ship it", "start_date": start.isoformat(), "end_date": end.isoformat()},
        headers=auth(ctx["token"]),
    ).json()


def _create_task(client, ctx, points):
    return client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": "T", "status": "todo", "priority": "low", "story_points": points},
        headers=auth(ctx["token"]),
    ).json()


def test_sprint_defaults_to_planning(client):
    ctx = make_org_with_project(client, "sp1@test.com")
    sprint = _create_sprint(client, ctx)
    assert sprint["status"] == "planning"
    assert sprint["total_points"] == 0


def test_adding_tasks_updates_point_totals(client):
    ctx = make_org_with_project(client, "sp2@test.com")
    sprint = _create_sprint(client, ctx)
    a = _create_task(client, ctx, 3)
    b = _create_task(client, ctx, 5)

    client.post(f"{_sprint_url(ctx, sprint['id'])}/tasks", json={"task_id": a["id"]}, headers=auth(ctx["token"]))
    res = client.post(f"{_sprint_url(ctx, sprint['id'])}/tasks", json={"task_id": b["id"]}, headers=auth(ctx["token"]))
    assert res.json()["total_points"] == 8
    assert res.json()["task_count"] == 2


def test_task_can_only_be_in_one_sprint(client):
    ctx = make_org_with_project(client, "sp3@test.com")
    sprint1 = _create_sprint(client, ctx)
    task = _create_task(client, ctx, 2)
    client.post(f"{_sprint_url(ctx, sprint1['id'])}/tasks", json={"task_id": task["id"]}, headers=auth(ctx["token"]))

    res = client.post(f"{_sprint_url(ctx, sprint1['id'])}/tasks", json={"task_id": task["id"]}, headers=auth(ctx["token"]))
    assert res.status_code == 409


def test_completed_points_and_burndown(client):
    ctx = make_org_with_project(client, "sp4@test.com")
    sprint = _create_sprint(client, ctx)
    a = _create_task(client, ctx, 3)
    b = _create_task(client, ctx, 5)
    client.post(f"{_sprint_url(ctx, sprint['id'])}/tasks", json={"task_id": a["id"]}, headers=auth(ctx["token"]))
    client.post(f"{_sprint_url(ctx, sprint['id'])}/tasks", json={"task_id": b["id"]}, headers=auth(ctx["token"]))

    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}/{a['id']}"
    client.put(task_url, json={"status": "done"}, headers=auth(ctx["token"]))

    sprints = client.get(_sprint_url(ctx), headers=auth(ctx["token"])).json()
    assert sprints[0]["completed_points"] == 3

    burndown = client.get(f"{_sprint_url(ctx, sprint['id'])}/burndown", headers=auth(ctx["token"])).json()
    assert burndown["total_points"] == 8
    assert burndown["days"][-1]["remaining_points"] == 5


def test_task_from_another_project_rejected(client):
    ctx = make_org_with_project(client, "sp5@test.com")
    sprint = _create_sprint(client, ctx)

    other_project = client.post(
        f"/api/orgs/{ctx['org_id']}/projects", json={"name": "Other", "status": "active"}, headers=auth(ctx["token"])
    ).json()
    other_sub = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{other_project['id']}/sub-projects",
        json={"name": "S", "status": "active"},
        headers=auth(ctx["token"]),
    ).json()
    other_task = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{other_project['id']}/tasks/{other_sub['id']}",
        json={"title": "Elsewhere", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    ).json()

    res = client.post(
        f"{_sprint_url(ctx, sprint['id'])}/tasks", json={"task_id": other_task["id"]}, headers=auth(ctx["token"])
    )
    assert res.status_code == 404


def test_remove_task_and_delete_sprint(client):
    ctx = make_org_with_project(client, "sp6@test.com")
    sprint = _create_sprint(client, ctx)
    task = _create_task(client, ctx, 2)
    client.post(f"{_sprint_url(ctx, sprint['id'])}/tasks", json={"task_id": task["id"]}, headers=auth(ctx["token"]))

    res = client.delete(f"{_sprint_url(ctx, sprint['id'])}/tasks/{task['id']}", headers=auth(ctx["token"]))
    assert res.status_code == 200
    assert client.get(f"{_sprint_url(ctx, sprint['id'])}/tasks", headers=auth(ctx["token"])).json() == []

    res = client.delete(_sprint_url(ctx, sprint["id"]), headers=auth(ctx["token"]))
    assert res.status_code == 200
    assert client.get(_sprint_url(ctx), headers=auth(ctx["token"])).json() == []


def test_sprints_require_membership(client):
    alice = make_org_with_project(client, "sp7a@test.com")
    bob = make_org_with_project(client, "sp7b@test.com")
    res = client.get(_sprint_url(alice), headers=auth(bob["token"]))
    assert res.status_code == 403
