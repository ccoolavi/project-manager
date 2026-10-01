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


def test_habit_analytics_counts_only_my_checkins_in_the_window(client):
    ctx = make_org_with_project(client, "an_h1@test.com")
    other = make_org_with_project(client, "an_h2@test.com")
    base = f"/api/orgs/{ctx['org_id']}/analytics/habits"

    empty = client.get(base, headers=auth(ctx["token"])).json()
    assert empty == {"habit_count": 0, "check_ins_30d": 0, "completion_rate_30d": 0}

    daily = client.post("/api/habits", json={"title": "Daily", "target_days": 7}, headers=auth(ctx["token"])).json()
    client.post("/api/habits", json={"title": "Weekly", "target_days": 1}, headers=auth(ctx["token"]))
    client.post(f"/api/habits/{daily['id']}/check", headers=auth(ctx["token"]))
    client.post("/api/habits", json={"title": "Someone else's"}, headers=auth(other["token"]))

    body = client.get(base, headers=auth(ctx["token"])).json()
    assert body["habit_count"] == 2  # the other person's habit is not counted
    assert body["check_ins_30d"] == 1
    # expected check-ins in 30 days: daily -> 30, weekly -> 4; achieved 1 of 34
    assert body["completion_rate_30d"] == round(1 / 34, 3)


def test_habit_analytics_ignores_old_checkins_and_needs_membership(client):
    from datetime import datetime, timedelta

    ctx = make_org_with_project(client, "an_h3@test.com")
    outsider = make_org_with_project(client, "an_h4@test.com")
    habit = client.post("/api/habits", json={"title": "Old", "target_days": 7}, headers=auth(ctx["token"])).json()
    client.post(f"/api/habits/{habit['id']}/check", headers=auth(ctx["token"]))

    # Age that check-in to 45 days ago directly in the database: it must fall outside the 30-day window.
    from database import get_db
    from main import app
    from models import Habit

    db = next(app.dependency_overrides[get_db]())
    row = db.query(Habit).filter(Habit.id == habit["id"]).first()
    row.completed_dates = [(datetime.utcnow() - timedelta(days=45)).date().isoformat()]
    db.commit()
    db.close()

    body = client.get(f"/api/orgs/{ctx['org_id']}/analytics/habits", headers=auth(ctx["token"])).json()
    assert body["check_ins_30d"] == 0 and body["completion_rate_30d"] == 0

    res = client.get(f"/api/orgs/{ctx['org_id']}/analytics/habits", headers=auth(outsider["token"]))
    assert res.status_code in (403, 404)
