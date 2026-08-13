"""Team workload aggregation: grouped by status, unassigned tasks excluded."""

from conftest import auth, make_org_with_project


def test_workload_empty_when_no_tasks(client):
    ctx = make_org_with_project(client, "wl1@test.com")
    res = client.get(f"/api/orgs/{ctx['org_id']}/workload", headers=auth(ctx["token"]))
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["total"] == 0


def test_workload_counts_by_status_and_excludes_unassigned(client):
    ctx = make_org_with_project(client, "wl2@test.com")
    task_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"

    members = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
    owner_id = members[0]["user_id"]

    client.post(task_url, json={"title": "a", "status": "todo", "priority": "low", "assignee_id": owner_id}, headers=auth(ctx["token"]))
    done_task = client.post(
        task_url, json={"title": "b", "status": "todo", "priority": "low", "assignee_id": owner_id},
        headers=auth(ctx["token"]),
    ).json()
    client.put(f"{task_url}/{done_task['id']}", json={"status": "done"}, headers=auth(ctx["token"]))
    # Unassigned — must not appear in anyone's count.
    client.post(task_url, json={"title": "c", "status": "in_progress", "priority": "low"}, headers=auth(ctx["token"]))

    res = client.get(f"/api/orgs/{ctx['org_id']}/workload", headers=auth(ctx["token"]))
    row = next(r for r in res.json() if r["user_id"] == owner_id)
    assert row["todo"] == 1
    assert row["done"] == 1
    assert row["in_progress"] == 0
    assert row["total"] == 2


def test_workload_requires_membership(client):
    alice = make_org_with_project(client, "wl3a@test.com")
    bob = make_org_with_project(client, "wl3b@test.com")
    res = client.get(f"/api/orgs/{alice['org_id']}/workload", headers=auth(bob["token"]))
    assert res.status_code == 403
