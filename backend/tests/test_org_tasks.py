"""Org-wide flat task list (B10 calendar / B11 bulk ops foundation)."""

from conftest import auth, make_org_with_project


def test_lists_tasks_across_multiple_projects_with_project_info(client):
    ctx = make_org_with_project(client, "orgtasks1@test.com")
    client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": "T1", "status": "todo", "priority": "high"},
        headers=auth(ctx["token"]),
    )

    other_project = client.post(
        f"/api/orgs/{ctx['org_id']}/projects", json={"name": "Other", "status": "active"}, headers=auth(ctx["token"])
    ).json()
    other_sub = client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{other_project['id']}/sub-projects",
        json={"name": "S", "status": "active"},
        headers=auth(ctx["token"]),
    ).json()
    client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{other_project['id']}/tasks/{other_sub['id']}",
        json={"title": "T2", "status": "todo", "priority": "low"},
        headers=auth(ctx["token"]),
    )

    res = client.get(f"/api/orgs/{ctx['org_id']}/tasks", headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 2
    titles = {t["title"]: t["project_id"] for t in body}
    assert titles["T1"] == ctx["project_id"]
    assert titles["T2"] == other_project["id"]
    assert all("project_name" in t for t in body)


def test_org_wide_tasks_isolated_by_org(client):
    alice = make_org_with_project(client, "orgtasks2a@test.com")
    bob = make_org_with_project(client, "orgtasks2b@test.com")
    client.post(
        f"/api/orgs/{alice['org_id']}/projects/{alice['project_id']}/tasks/{alice['sub_id']}",
        json={"title": "Alice's task", "status": "todo", "priority": "low"},
        headers=auth(alice["token"]),
    )

    res = client.get(f"/api/orgs/{bob['org_id']}/tasks", headers=auth(bob["token"]))
    assert res.json() == []

    res = client.get(f"/api/orgs/{alice['org_id']}/tasks", headers=auth(bob["token"]))
    assert res.status_code == 403


def test_org_wide_tasks_requires_auth(client):
    ctx = make_org_with_project(client, "orgtasks3@test.com")
    res = client.get(f"/api/orgs/{ctx['org_id']}/tasks")
    assert res.status_code == 403
