"""My Timeline planning view: who can see what, and the numbers it returns.

Dates are built from the server's UTC today and every request passes
work_days=1..7 where weekday would otherwise matter, so the suite gives the
same answer on any day of the week.
"""

from datetime import datetime, timedelta

from conftest import auth, make_org_with_project, register, login

ALL_DAYS = "1,2,3,4,5,6,7"


def today():
    return datetime.utcnow().date()


def iso(d, days=0):
    return f"{(d + timedelta(days=days)).isoformat()}T00:00:00"


def db_session():
    from database import get_db
    from main import app
    return next(app.dependency_overrides[get_db]())


def user_id(client, ctx):
    return client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()[0]["user_id"]


def task_url(ctx, task_id=""):
    base = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    return f"{base}/{task_id}" if task_id else base


def make_task(client, ctx, title, assignee, **extra):
    body = {"title": title, "status": "todo", "priority": "medium", "assignee_id": assignee, **extra}
    res = client.post(task_url(ctx), json=body, headers=auth(ctx["token"]))
    assert res.status_code == 200, res.text
    return res.json()


def second_org(client, email, name="Org B"):
    """A second org (with project and section) for the same person."""
    org = client.post("/api/orgs", json={"name": name}, headers=auth(login(client, email))).json()
    token = login(client, email)
    project = client.post(f"/api/orgs/{org['id']}/projects", json={"name": "PB", "status": "active"},
                          headers=auth(token)).json()
    sub = client.post(f"/api/orgs/{org['id']}/projects/{project['id']}/sub-projects",
                      json={"name": "SB", "status": "active"}, headers=auth(token)).json()
    return {"token": token, "org_id": org["id"], "project_id": project["id"], "sub_id": sub["id"]}


def timeline(client, token, **params):
    params.setdefault("work_days", ALL_DAYS)
    return client.get("/api/me/timeline", params=params, headers=auth(token))


# ---- shape and the planning numbers ----------------------------------

def test_old_keys_stay_and_new_ones_arrive(client):
    ctx = make_org_with_project(client, "shape@test.com")
    make_task(client, ctx, "t", user_id(client, ctx), due_date=iso(today(), 2))
    body = timeline(client, ctx["token"]).json()
    for key in ("tasks", "sprints", "days", "warnings", "unscheduled_task_ids", "summary", "window"):
        assert key in body
    t = body["tasks"][0]
    for key in ("organization_id", "project_id", "sub_project_id", "effort_hours", "effort_source", "remaining_hours"):
        assert key in t


def test_two_orgs_on_the_same_day_is_a_cross_org_overload(client):
    a = make_org_with_project(client, "clash@test.com")
    me = user_id(client, a)
    b = second_org(client, "clash@test.com")
    d = today() + timedelta(days=3)
    make_task(client, a, "A work", me, due_date=iso(d), estimate_hours=6)
    make_task(client, b, "B work", me, due_date=iso(d), estimate_hours=6)

    body = timeline(client, login(client, "clash@test.com")).json()
    over = [w for w in body["warnings"] if w["kind"] == "overload"]
    assert len(over) == 1
    assert over[0]["cross_org"] is True and over[0]["severity"] == "red"
    assert over[0]["hours"] == 12 and over[0]["capacity"] == 8
    assert body["summary"]["overloaded_days_next_14"] == 1
    assert body["summary"]["first_clash"]["org_count"] == 2
    day = next(x for x in body["days"] if x["date"] == d.isoformat())
    assert len(day["org_ids"]) == 2


def test_estimate_is_saved_validated_and_used(client):
    ctx = make_org_with_project(client, "est@test.com")
    me = user_id(client, ctx)
    t = make_task(client, ctx, "e", me, due_date=iso(today(), 1), estimate_hours=5.5)
    assert t["estimate_hours"] == 5.5

    put = client.put(task_url(ctx, t["id"]), json={"estimate_hours": 3}, headers=auth(ctx["token"]))
    assert put.status_code == 200 and put.json()["estimate_hours"] == 3

    for bad in (0, -1, 201):
        res = client.put(task_url(ctx, t["id"]), json={"estimate_hours": bad}, headers=auth(ctx["token"]))
        assert res.status_code == 422

    row = timeline(client, ctx["token"]).json()["tasks"][0]
    assert row["effort_hours"] == 3 and row["effort_source"] == "estimate"


def test_effort_falls_back_to_points_then_default(client):
    ctx = make_org_with_project(client, "fallback@test.com")
    me = user_id(client, ctx)
    make_task(client, ctx, "pts", me, due_date=iso(today(), 1), story_points=3)
    make_task(client, ctx, "none", me, due_date=iso(today(), 1))
    rows = {t["title"]: t for t in timeline(client, ctx["token"]).json()["tasks"]}
    assert (rows["pts"]["effort_hours"], rows["pts"]["effort_source"]) == (6, "points")
    assert (rows["none"]["effort_hours"], rows["none"]["effort_source"]) == (2, "default")


def test_blocker_due_after_planned_start_warns(client):
    ctx = make_org_with_project(client, "block@test.com")
    me = user_id(client, ctx)
    blocker = make_task(client, ctx, "blocker", me, due_date=iso(today(), 6))
    blocked = make_task(client, ctx, "blocked", me, start_date=iso(today(), 2), due_date=iso(today(), 8))
    res = client.post(f"{task_url(ctx, blocked['id'])}/dependencies", json={"depends_on_id": blocker["id"]},
                      headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = timeline(client, ctx["token"]).json()
    w = [x for x in body["warnings"] if x["kind"] == "starts_before_blocker"]
    assert [x["task_ids"] for x in w] == [[blocked["id"]]]
    row = next(t for t in body["tasks"] if t["id"] == blocked["id"])
    assert row["blocked"] is True and row["blocker_due"] == (today() + timedelta(days=6)).isoformat()


def test_unscheduled_and_done(client):
    ctx = make_org_with_project(client, "undone@test.com")
    me = user_id(client, ctx)
    nodate = make_task(client, ctx, "no date", me)
    make_task(client, ctx, "finished", me, status="done", due_date=iso(today(), 1))
    body = timeline(client, ctx["token"]).json()
    assert [t["title"] for t in body["tasks"]] == ["no date"]
    assert body["unscheduled_task_ids"] == [nodate["id"]]
    body = timeline(client, ctx["token"], include_done="true").json()
    assert {t["title"] for t in body["tasks"]} == {"no date", "finished"}
    assert all(x["task_ids"] != [] for x in body["days"])
    done_id = next(t["id"] for t in body["tasks"] if t["title"] == "finished")
    assert all(done_id not in x["task_ids"] for x in body["days"])


def test_window_limits_what_is_returned(client):
    ctx = make_org_with_project(client, "window@test.com")
    me = user_id(client, ctx)
    make_task(client, ctx, "soon", me, due_date=iso(today(), 3))
    make_task(client, ctx, "far", me, due_date=iso(today(), 200))
    titles = {t["title"] for t in timeline(client, ctx["token"]).json()["tasks"]}
    assert titles == {"soon"}
    wide = timeline(client, ctx["token"], to=(today() + timedelta(days=250)).isoformat())
    assert {t["title"] for t in wide.json()["tasks"]} == {"soon", "far"}


def test_overdue_open_task_always_shows(client):
    ctx = make_org_with_project(client, "late@test.com")
    me = user_id(client, ctx)
    make_task(client, ctx, "late", me, due_date=iso(today(), -60))
    body = timeline(client, ctx["token"]).json()
    assert body["tasks"][0]["overdue"] is True
    assert any(w["kind"] == "overdue" for w in body["warnings"])


# ---- parameters -------------------------------------------------------

def test_bad_parameters_are_refused(client):
    ctx = make_org_with_project(client, "params@test.com")
    t = today()
    cases = [
        {"to": (t - timedelta(days=30)).isoformat(), "from": t.isoformat()},
        {"from": t.isoformat(), "to": (t + timedelta(days=400)).isoformat()},
        {"hours_per_day": 0},
        {"hours_per_day": 25},
        {"work_days": "0"},
        {"work_days": "8"},
        {"work_days": "x"},
        {"today": (t + timedelta(days=5)).isoformat()},
    ]
    for params in cases:
        res = client.get("/api/me/timeline", params=params, headers=auth(ctx["token"]))
        assert res.status_code == 422, params


def test_timeline_requires_auth(client):
    assert client.get("/api/me/timeline").status_code in (401, 403)


# ---- who can see what -------------------------------------------------

def test_other_peoples_and_unassigned_tasks_never_appear(client):
    ctx = make_org_with_project(client, "owner-x@test.com")
    me = user_id(client, ctx)
    register(client, "mate-x@test.com")
    mate_id = login(client, "mate-x@test.com")
    res = client.post(f"/api/orgs/{ctx['org_id']}/members", json={"email": "mate-x@test.com", "role": "member"},
                      headers=auth(ctx["token"]))
    assert res.status_code == 200, res.text
    mate = next(m for m in client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
                if m["user_id"] != me)["user_id"]
    make_task(client, ctx, "mine", me, due_date=iso(today(), 1))
    make_task(client, ctx, "theirs", mate, due_date=iso(today(), 1))
    make_task(client, ctx, "nobody", None, due_date=iso(today(), 1))

    mine = timeline(client, ctx["token"]).json()
    assert [t["title"] for t in mine["tasks"]] == ["mine"]
    theirs = timeline(client, login(client, "mate-x@test.com")).json()
    assert [t["title"] for t in theirs["tasks"]] == ["theirs"]


def test_a_person_outside_every_org_sees_nothing(client):
    make_org_with_project(client, "busy-org@test.com")
    register(client, "stranger@test.com")
    body = timeline(client, login(client, "stranger@test.com")).json()
    assert body["tasks"] == [] and body["days"] == [] and body["summary"] == {}


def test_project_only_access_is_included_and_other_projects_are_not(client):
    ctx = make_org_with_project(client, "granter@test.com")
    other_project = client.post(f"/api/orgs/{ctx['org_id']}/projects", json={"name": "Other", "status": "active"},
                                headers=auth(ctx["token"])).json()
    other_sub = client.post(f"/api/orgs/{ctx['org_id']}/projects/{other_project['id']}/sub-projects",
                            json={"name": "OS", "status": "active"}, headers=auth(ctx["token"])).json()
    register(client, "guest@test.com")
    login(client, "guest@test.com")

    from models import ProjectMember, ProjectRole, Task, User
    db = db_session()
    guest = db.query(User).filter(User.email == "guest@test.com").first()
    granter = db.query(User).filter(User.email == "granter@test.com").first()
    db.add(ProjectMember(project_id=ctx["project_id"], user_id=guest.id, role=ProjectRole.viewer,
                         invited_by=granter.id))
    db.commit()

    make_task(client, ctx, "in granted project", granter.id, due_date=iso(today(), 1))
    # Assigned to the guest in a project they were NOT granted: must stay hidden.
    hidden = Task(sub_project_id=other_sub["id"], title="hidden", assignee_id=guest.id,
                  due_date=today() and datetime.combine(today() + timedelta(days=1), datetime.min.time()),
                  created_by=granter.id)
    granted = Task(sub_project_id=ctx["sub_id"], title="granted", assignee_id=guest.id,
                   due_date=datetime.combine(today() + timedelta(days=1), datetime.min.time()),
                   created_by=granter.id)
    db.add_all([hidden, granted])
    db.commit()
    db.close()

    body = timeline(client, login(client, "guest@test.com")).json()
    assert [t["title"] for t in body["tasks"]] == ["granted"]
    assert body["tasks"][0]["organization_id"] == ctx["org_id"]


def test_losing_access_removes_the_tasks_at_once(client):
    ctx = make_org_with_project(client, "revoke-own@test.com")
    me = user_id(client, ctx)
    register(client, "revoked@test.com")
    client.post(f"/api/orgs/{ctx['org_id']}/members", json={"email": "revoked@test.com", "role": "member"},
                headers=auth(ctx["token"]))
    token = login(client, "revoked@test.com")
    mate = next(m for m in client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
                if m["user_id"] != me)
    make_task(client, ctx, "was mine", mate["user_id"], due_date=iso(today(), 1))
    assert len(timeline(client, token).json()["tasks"]) == 1

    # The real remove-member route asks for an emailed code, so drop the row directly:
    # what matters here is what the timeline does once the membership is gone.
    from models import OrganizationMember
    db = db_session()
    db.query(OrganizationMember).filter(OrganizationMember.id == mate["id"]).delete()
    db.commit()
    db.close()
    assert timeline(client, token).json()["tasks"] == []


def test_completed_sprints_are_left_out(client):
    ctx = make_org_with_project(client, "sprint-tl@test.com")
    me = user_id(client, ctx)
    t1 = make_task(client, ctx, "in active", me, due_date=iso(today(), 2))
    t2 = make_task(client, ctx, "in done sprint", me, due_date=iso(today(), 2))

    from models import Sprint, SprintTask
    db = db_session()
    start = datetime.combine(today() - timedelta(days=3), datetime.min.time())
    end = datetime.combine(today() + timedelta(days=5), datetime.min.time())
    live = Sprint(organization_id=ctx["org_id"], project_id=ctx["project_id"], name="Live", start_date=start,
                  end_date=end, status="active")
    done = Sprint(organization_id=ctx["org_id"], project_id=ctx["project_id"], name="Done", start_date=start,
                  end_date=end, status="completed")
    db.add_all([live, done])
    db.commit()
    db.add_all([SprintTask(sprint_id=live.id, task_id=t1["id"]), SprintTask(sprint_id=done.id, task_id=t2["id"])])
    db.commit()
    db.close()

    names = [s["name"] for s in timeline(client, ctx["token"]).json()["sprints"]]
    assert names == ["Live"]


def test_a_task_in_an_org_i_do_not_belong_to_stays_hidden(client):
    """Assigned to me, but in an organisation I am not in and hold no grant for (for example I was removed):
    it must not appear, even though I do belong to another organisation."""
    mine = make_org_with_project(client, "keeper@test.com")
    me = user_id(client, mine)
    theirs = make_org_with_project(client, "other-owner@test.com")
    make_task(client, mine, "visible", me, due_date=iso(today(), 1))

    from models import Task
    db = db_session()
    db.add(Task(sub_project_id=theirs["sub_id"], title="stale assignment", assignee_id=me,
                due_date=datetime.combine(today() + timedelta(days=1), datetime.min.time()), created_by=me))
    db.commit()
    db.close()

    body = timeline(client, mine["token"]).json()
    assert [t["title"] for t in body["tasks"]] == ["visible"]
