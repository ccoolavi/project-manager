"""My Timeline: only tasks assigned to the caller, across every org they
belong to — never an org's full backlog just because they're a member."""

from conftest import auth, make_org_with_project, register, login


def test_timeline_only_includes_tasks_assigned_to_me(client):
    ctx = make_org_with_project(client, "tl-owner@test.com")
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"

    owner_id = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()[0]["user_id"]

    mine = client.post(
        task_url, json={"title": "assigned to me", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(ctx["token"]),
    ).json()
    client.post(
        task_url, json={"title": "unassigned", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    )

    res = client.get("/api/me/timeline", headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = res.json()
    titles = [t["title"] for t in body["tasks"]]
    assert "assigned to me" in titles
    assert "unassigned" not in titles
    mine_entry = next(t for t in body["tasks"] if t["id"] == mine["id"])
    assert mine_entry["organization_id"] == ctx["org_id"]
    assert mine_entry["project_id"] == ctx["project_id"]
    assert mine_entry["sub_project_id"] == ctx["sub_id"]


def test_timeline_spans_multiple_orgs(client):
    ctx_a = make_org_with_project(client, "tl-multi@test.com")
    owner_id = client.get(f"/api/orgs/{ctx_a['org_id']}/members", headers=auth(ctx_a["token"])).json()[0]["user_id"]
    task_url_a = f"/api/orgs/{ctx_a['org_id']}/projects/{ctx_a['project_id']}/tasks/{ctx_a['sub_id']}"
    client.post(
        task_url_a, json={"title": "org A task", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(ctx_a["token"]),
    )

    org_b = client.post("/api/orgs", json={"name": "Org B"}, headers=auth(ctx_a["token"])).json()
    token_b = login(client, "tl-multi@test.com")
    project_b = client.post(
        f"/api/orgs/{org_b['id']}/projects", json={"name": "PB", "status": "active"}, headers=auth(token_b)
    ).json()
    sub_b = client.post(
        f"/api/orgs/{org_b['id']}/projects/{project_b['id']}/sub-projects",
        json={"name": "SB", "status": "active"}, headers=auth(token_b),
    ).json()
    task_url_b = f"/api/orgs/{org_b['id']}/projects/{project_b['id']}/tasks/{sub_b['id']}"
    client.post(
        task_url_b, json={"title": "org B task", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(token_b),
    )

    res = client.get("/api/me/timeline", headers=auth(token_b))
    titles = {t["title"] for t in res.json()["tasks"]}
    assert titles == {"org A task", "org B task"}


def test_timeline_requires_auth(client):
    res = client.get("/api/me/timeline")
    assert res.status_code in (401, 403)
