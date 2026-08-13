"""Task dependencies: blocking, unblocking, and cross-project/org rejection."""

from conftest import auth, make_org_with_project


def _task_url(ctx, task_id=""):
    base = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    return f"{base}/{task_id}" if task_id else base


def _create(client, ctx, title):
    return client.post(
        _task_url(ctx), json={"title": title, "status": "todo", "priority": "high"}, headers=auth(ctx["token"])
    ).json()


def test_task_becomes_blocked_and_unblocks(client):
    ctx = make_org_with_project(client, "dep1@test.com")
    blocker = _create(client, ctx, "Blocker")
    blocked = _create(client, ctx, "Blocked")

    assert client.get(_task_url(ctx, blocked["id"]), headers=auth(ctx["token"])).json()["blocked"] is False

    res = client.post(
        f"{_task_url(ctx, blocked['id'])}/dependencies",
        json={"depends_on_id": blocker["id"]},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200
    assert res.json()["depends_on_title"] == "Blocker"

    assert client.get(_task_url(ctx, blocked["id"]), headers=auth(ctx["token"])).json()["blocked"] is True

    client.put(_task_url(ctx, blocker["id"]), json={"status": "done"}, headers=auth(ctx["token"]))
    assert client.get(_task_url(ctx, blocked["id"]), headers=auth(ctx["token"])).json()["blocked"] is False


def test_self_dependency_rejected(client):
    ctx = make_org_with_project(client, "dep2@test.com")
    task = _create(client, ctx, "T")
    res = client.post(
        f"{_task_url(ctx, task['id'])}/dependencies",
        json={"depends_on_id": task["id"]},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 400


def test_duplicate_dependency_rejected(client):
    ctx = make_org_with_project(client, "dep3@test.com")
    a = _create(client, ctx, "A")
    b = _create(client, ctx, "B")
    url = f"{_task_url(ctx, b['id'])}/dependencies"
    client.post(url, json={"depends_on_id": a["id"]}, headers=auth(ctx["token"]))
    res = client.post(url, json={"depends_on_id": a["id"]}, headers=auth(ctx["token"]))
    assert res.status_code == 409


def test_cross_project_dependency_rejected(client):
    ctx = make_org_with_project(client, "dep4@test.com")
    a = _create(client, ctx, "A")

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
        f"{_task_url(ctx, a['id'])}/dependencies",
        json={"depends_on_id": other_task["id"]},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 404


def test_remove_dependency(client):
    ctx = make_org_with_project(client, "dep5@test.com")
    a = _create(client, ctx, "A")
    b = _create(client, ctx, "B")
    dep = client.post(
        f"{_task_url(ctx, b['id'])}/dependencies", json={"depends_on_id": a["id"]}, headers=auth(ctx["token"])
    ).json()

    res = client.delete(f"{_task_url(ctx, b['id'])}/dependencies/{dep['id']}", headers=auth(ctx["token"]))
    assert res.status_code == 200
    assert client.get(f"{_task_url(ctx, b['id'])}/dependencies", headers=auth(ctx["token"])).json() == []
    assert client.get(_task_url(ctx, b["id"]), headers=auth(ctx["token"])).json()["blocked"] is False


def test_cross_org_dependency_creation_blocked(client):
    alice = make_org_with_project(client, "dep6a@test.com")
    bob = make_org_with_project(client, "dep6b@test.com")
    a = _create(client, alice, "A")
    blocked = _create(client, alice, "Blocked")

    forged = {**alice, "org_id": bob["org_id"]}
    res = client.post(
        f"{_task_url(forged, blocked['id'])}/dependencies",
        json={"depends_on_id": a["id"]},
        headers=auth(bob["token"]),
    )
    assert res.status_code == 404
