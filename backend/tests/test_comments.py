"""Task comments: creation, listing, deletion, comment_count, and isolation."""

from conftest import auth, make_org_with_project


def _base(ctx, task_id):
    return f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}/{task_id}/comments"


def _create_task(client, ctx, title="T"):
    return client.post(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": title, "status": "todo", "priority": "high"},
        headers=auth(ctx["token"]),
    ).json()


def test_comment_round_trip_and_count(client):
    ctx = make_org_with_project(client, "cm1@test.com")
    task = _create_task(client, ctx)

    listed = client.get(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        headers=auth(ctx["token"]),
    ).json()
    assert listed[0]["comment_count"] == 0

    res = client.post(_base(ctx, task["id"]), json={"content": "hello"}, headers=auth(ctx["token"]))
    assert res.status_code == 200
    assert res.json()["content"] == "hello"

    comments = client.get(_base(ctx, task["id"]), headers=auth(ctx["token"])).json()
    assert len(comments) == 1

    listed = client.get(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        headers=auth(ctx["token"]),
    ).json()
    assert listed[0]["comment_count"] == 1


def test_blank_comment_rejected(client):
    ctx = make_org_with_project(client, "cm2@test.com")
    task = _create_task(client, ctx)
    res = client.post(_base(ctx, task["id"]), json={"content": "   "}, headers=auth(ctx["token"]))
    assert res.status_code == 400


def test_author_can_delete_own_comment(client):
    ctx = make_org_with_project(client, "cm3@test.com")
    task = _create_task(client, ctx)
    comment = client.post(_base(ctx, task["id"]), json={"content": "x"}, headers=auth(ctx["token"])).json()
    res = client.delete(f"{_base(ctx, task['id'])}/{comment['id']}", headers=auth(ctx["token"]))
    assert res.status_code == 200
    assert client.get(_base(ctx, task["id"]), headers=auth(ctx["token"])).json() == []


def test_cross_org_comments_are_isolated(client):
    alice = make_org_with_project(client, "cm4a@test.com")
    bob = make_org_with_project(client, "cm4b@test.com")
    task = _create_task(client, alice)
    client.post(_base(alice, task["id"]), json={"content": "secret"}, headers=auth(alice["token"]))

    forged = {**alice, "org_id": bob["org_id"]}
    res = client.get(_base(forged, task["id"]), headers=auth(bob["token"]))
    assert res.status_code == 404
