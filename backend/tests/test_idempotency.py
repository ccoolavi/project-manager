"""Idempotent writes: a retried or replayed request must not execute twice."""

from conftest import auth, make_org_with_project, register


def _tasks_url(ctx):
    return f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"


def _list(client, ctx):
    return client.get(_tasks_url(ctx), headers=auth(ctx["token"])).json()


def test_same_key_creates_one_task_and_replays_the_same_answer(client):
    ctx = make_org_with_project(client, "idem1@test.com")
    headers = {**auth(ctx["token"]), "Idempotency-Key": "k-1"}
    first = client.post(_tasks_url(ctx), json={"title": "Once", "status": "todo", "priority": "low"}, headers=headers)
    second = client.post(_tasks_url(ctx), json={"title": "Once", "status": "todo", "priority": "low"}, headers=headers)
    assert first.status_code == 200 and second.status_code == 200
    assert second.json() == first.json()
    assert second.headers.get("Idempotent-Replay") == "true"
    assert len(_list(client, ctx)) == 1


def test_different_keys_create_separate_tasks(client):
    ctx = make_org_with_project(client, "idem2@test.com")
    for i in range(2):
        client.post(_tasks_url(ctx), json={"title": f"T{i}", "status": "todo", "priority": "low"},
                    headers={**auth(ctx["token"]), "Idempotency-Key": f"k-{i}"})
    assert len(_list(client, ctx)) == 2


def test_no_key_behaves_exactly_as_before(client):
    ctx = make_org_with_project(client, "idem3@test.com")
    for _ in range(2):
        client.post(_tasks_url(ctx), json={"title": "Same", "status": "todo", "priority": "low"}, headers=auth(ctx["token"]))
    assert len(_list(client, ctx)) == 2


def test_failed_request_is_not_recorded_so_a_real_retry_still_works(client):
    ctx = make_org_with_project(client, "idem4@test.com")
    headers = {**auth(ctx["token"]), "Idempotency-Key": "k-fail"}
    bad = client.post(_tasks_url(ctx), json={"status": "todo"}, headers=headers)  # missing title -> 422
    assert bad.status_code == 422
    good = client.post(_tasks_url(ctx), json={"title": "Now valid", "status": "todo", "priority": "low"}, headers=headers)
    assert good.status_code == 200 and good.headers.get("Idempotent-Replay") is None
    assert len(_list(client, ctx)) == 1


def test_keys_are_per_user_not_shared(client):
    a = make_org_with_project(client, "idem5a@test.com")
    b = make_org_with_project(client, "idem5b@test.com")
    shared = "same-key-two-users"
    client.post(_tasks_url(a), json={"title": "A's", "status": "todo", "priority": "low"}, headers={**auth(a["token"]), "Idempotency-Key": shared})
    client.post(_tasks_url(b), json={"title": "B's", "status": "todo", "priority": "low"}, headers={**auth(b["token"]), "Idempotency-Key": shared})
    assert [t["title"] for t in _list(client, a)] == ["A's"]
    assert [t["title"] for t in _list(client, b)] == ["B's"]


def test_replay_works_for_delete_and_does_not_double_execute(client):
    ctx = make_org_with_project(client, "idem6@test.com")
    task = client.post(_tasks_url(ctx), json={"title": "Del", "status": "todo", "priority": "low"}, headers=auth(ctx["token"])).json()
    headers = {**auth(ctx["token"]), "Idempotency-Key": "k-del"}
    one = client.delete(f"{_tasks_url(ctx)}/{task['id']}", headers=headers)
    two = client.delete(f"{_tasks_url(ctx)}/{task['id']}", headers=headers)   # would be 404 if it ran again
    assert one.status_code == 200 and two.status_code == 200
    assert two.headers.get("Idempotent-Replay") == "true"


def test_auth_routes_are_never_recorded(client):
    # Login answers contain tokens, so they must not be stored even when a key is sent.
    token = register(client, "idem7@test.com")
    assert token
    res = client.post("/api/auth/login", json={"identifier": "idem7@test.com", "password": "TestPass123"},
                      headers={"Idempotency-Key": "k-login"})
    assert res.status_code == 200 and res.headers.get("Idempotent-Replay") is None
    again = client.post("/api/auth/login", json={"identifier": "idem7@test.com", "password": "TestPass123"},
                        headers={"Idempotency-Key": "k-login"})
    assert again.headers.get("Idempotent-Replay") is None


def test_unauthenticated_write_is_untouched(client):
    res = client.post("/api/orgs", json={"name": "No auth"}, headers={"Idempotency-Key": "k-anon"})
    assert res.status_code in (401, 403)
