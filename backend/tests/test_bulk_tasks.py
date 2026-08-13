"""Bulk task operations: update_status, set_priority, assign, delete."""

from conftest import auth, make_org_with_project


def _task_url(ctx, task_id=""):
    base = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    return f"{base}/{task_id}" if task_id else base


def _bulk_url(ctx):
    return f"/api/orgs/{ctx['org_id']}/tasks/bulk"


def _create(client, ctx, title):
    return client.post(
        _task_url(ctx), json={"title": title, "status": "todo", "priority": "low"}, headers=auth(ctx["token"])
    ).json()


def test_bulk_update_status(client):
    ctx = make_org_with_project(client, "bulk1@test.com")
    a = _create(client, ctx, "A")
    b = _create(client, ctx, "B")

    res = client.post(
        _bulk_url(ctx),
        json={"task_ids": [a["id"], b["id"]], "action": "update_status", "value": "in_progress"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200
    assert res.json() == {"updated": 2, "failed": []}

    assert client.get(_task_url(ctx, a["id"]), headers=auth(ctx["token"])).json()["status"] == "in_progress"
    assert client.get(_task_url(ctx, b["id"]), headers=auth(ctx["token"])).json()["status"] == "in_progress"


def test_bulk_invalid_status_rejected(client):
    ctx = make_org_with_project(client, "bulk2@test.com")
    a = _create(client, ctx, "A")
    res = client.post(
        _bulk_url(ctx),
        json={"task_ids": [a["id"]], "action": "update_status", "value": "not_a_real_status"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 400


def test_bulk_set_priority(client):
    ctx = make_org_with_project(client, "bulk3@test.com")
    a = _create(client, ctx, "A")
    res = client.post(
        _bulk_url(ctx), json={"task_ids": [a["id"]], "action": "set_priority", "value": "urgent"}, headers=auth(ctx["token"])
    )
    assert res.json()["updated"] == 1
    assert client.get(_task_url(ctx, a["id"]), headers=auth(ctx["token"])).json()["priority"] == "urgent"


def test_bulk_delete(client):
    ctx = make_org_with_project(client, "bulk4@test.com")
    a = _create(client, ctx, "A")
    b = _create(client, ctx, "B")
    res = client.post(
        _bulk_url(ctx), json={"task_ids": [a["id"], b["id"]], "action": "delete"}, headers=auth(ctx["token"])
    )
    assert res.json()["updated"] == 2
    assert client.get(_task_url(ctx, a["id"]), headers=auth(ctx["token"])).status_code == 404
    assert client.get(_task_url(ctx, b["id"]), headers=auth(ctx["token"])).status_code == 404


def test_bulk_unknown_action_rejected(client):
    ctx = make_org_with_project(client, "bulk5@test.com")
    a = _create(client, ctx, "A")
    res = client.post(_bulk_url(ctx), json={"task_ids": [a["id"]], "action": "nonsense"}, headers=auth(ctx["token"]))
    assert res.status_code == 400


def test_bulk_cross_org_task_id_reported_as_failed_not_silently_dropped(client):
    """The exact bug that shipped once already: an id from another org must
    be rejected loudly, not skipped without a trace."""
    alice = make_org_with_project(client, "bulk6a@test.com")
    bob = make_org_with_project(client, "bulk6b@test.com")
    alice_task = _create(client, alice, "Alice's task")

    res = client.post(
        _bulk_url(bob),
        json={"task_ids": [alice_task["id"]], "action": "update_status", "value": "done"},
        headers=auth(bob["token"]),
    )
    body = res.json()
    assert body["updated"] == 0
    assert len(body["failed"]) == 1
    assert body["failed"][0]["task_id"] == alice_task["id"]

    # And Alice's task really is untouched.
    still = client.get(_task_url(alice, alice_task["id"]), headers=auth(alice["token"])).json()
    assert still["status"] == "todo"


def test_bulk_assign_sets_assignee_on_every_task(client):
    ctx = make_org_with_project(client, "bulk7@test.com")
    members = client.get(f"/api/orgs/{ctx['org_id']}/members", headers=auth(ctx["token"])).json()
    owner_id = members[0]["user_id"]
    a = _create(client, ctx, "A")
    b = _create(client, ctx, "B")

    res = client.post(
        _bulk_url(ctx),
        json={"task_ids": [a["id"], b["id"]], "action": "assign", "value": str(owner_id)},
        headers=auth(ctx["token"]),
    )
    assert res.json()["updated"] == 2
    assert client.get(_task_url(ctx, a["id"]), headers=auth(ctx["token"])).json()["assignee_id"] == owner_id
    assert client.get(_task_url(ctx, b["id"]), headers=auth(ctx["token"])).json()["assignee_id"] == owner_id


def test_bulk_requires_membership(client):
    alice = make_org_with_project(client, "bulk8a@test.com")
    bob = make_org_with_project(client, "bulk8b@test.com")
    res = client.post(
        _bulk_url(alice), json={"task_ids": [1], "action": "delete"}, headers=auth(bob["token"])
    )
    assert res.status_code == 403
