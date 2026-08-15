"""Analytics: task completion, time totals, velocity."""

from conftest import auth, make_org_with_project


def test_task_analytics_completion_rate(client):
    ctx = make_org_with_project(client, "an1@test.com")
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"

    ids = []
    for i in range(4):
        t = client.post(
            task_url, json={"title": f"t{i}", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
        ).json()
        ids.append(t["id"])
    client.put(f"{task_url}/{ids[0]}", json={"status": "done"}, headers=auth(ctx["token"]))

    res = client.get(f"/api/orgs/{ctx['org_id']}/analytics/tasks", headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = res.json()
    assert body["overall"]["total"] == 4
    assert body["overall"]["done"] == 1
    assert body["overall"]["completion_rate"] == 0.25
    assert body["projects"][0]["project_id"] == ctx["project_id"]


def test_task_analytics_empty_org(client):
    ctx = make_org_with_project(client, "an2@test.com")
    res = client.get(f"/api/orgs/{ctx['org_id']}/analytics/tasks", headers=auth(ctx["token"]))
    body = res.json()
    assert body["overall"]["total"] == 0
    assert body["overall"]["completion_rate"] == 0
    assert body["projects"] == []


def test_time_analytics_sums_by_category(client):
    ctx = make_org_with_project(client, "an4@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/time", json={"duration_minutes": 60, "category": "development"}, headers=auth(ctx["token"])
    )
    client.post(
        f"/api/orgs/{ctx['org_id']}/time", json={"duration_minutes": 30, "category": "development"}, headers=auth(ctx["token"])
    )
    client.post(
        f"/api/orgs/{ctx['org_id']}/time", json={"duration_minutes": 45, "category": "meeting"}, headers=auth(ctx["token"])
    )

    res = client.get(f"/api/orgs/{ctx['org_id']}/analytics/time", headers=auth(ctx["token"]))
    rows = {r["category"]: r["hours"] for r in res.json()}
    assert rows["development"] == 1.5
    # The endpoint rounds to 1 decimal place; 45 minutes = 0.75h rounds to 0.8.
    assert rows["meeting"] == 0.8


def test_velocity_returns_eight_weeks_with_current_week_populated(client):
    ctx = make_org_with_project(client, "an5@test.com")
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    task = client.post(
        task_url, json={"title": "t", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
    ).json()
    client.put(f"{task_url}/{task['id']}", json={"status": "done"}, headers=auth(ctx["token"]))

    res = client.get(f"/api/orgs/{ctx['org_id']}/analytics/velocity", headers=auth(ctx["token"]))
    weeks = res.json()
    assert len(weeks) == 8
    assert weeks[-1]["completed"] == 1


def test_analytics_requires_membership(client):
    alice = make_org_with_project(client, "an6a@test.com")
    bob = make_org_with_project(client, "an6b@test.com")
    for endpoint in ("tasks", "time", "velocity"):
        res = client.get(f"/api/orgs/{alice['org_id']}/analytics/{endpoint}", headers=auth(bob["token"]))
        assert res.status_code == 403, endpoint
