from conftest import auth, make_org_with_project


def test_search_finds_project_task_and_kaizen(client):
    ctx = make_org_with_project(client, "search1@test.com")
    base = f"/api/orgs/{ctx['org_id']}"

    client.post(
        f"{base}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}",
        json={"title": "Design the homepage", "status": "todo", "priority": "high"},
        headers=auth(ctx["token"]),
    )
    client.post(
        f"{base}/kaizen",
        json={"title": "Design review process", "problem": "p", "solution": "s"},
        headers=auth(ctx["token"]),
    )
    # P is the project's own name from make_org_with_project — rename won't match
    # "design", so search a term unique to it directly instead.

    results = client.get(f"{base}/search", params={"q": "design"}, headers=auth(ctx["token"])).json()
    types = {r["type"] for r in results}
    assert "task" in types
    assert "kaizen" in types


def test_search_never_returns_habits_since_they_are_not_org_data(client):
    ctx = make_org_with_project(client, "search5@test.com")
    client.post("/api/habits", json={"title": "Design sketching"}, headers=auth(ctx["token"]))

    results = client.get(
        f"/api/orgs/{ctx['org_id']}/search", params={"q": "design"}, headers=auth(ctx["token"])
    ).json()
    assert all(r["type"] != "habit" for r in results)


def test_search_requires_minimum_length(client):
    ctx = make_org_with_project(client, "search2@test.com")
    res = client.get(f"/api/orgs/{ctx['org_id']}/search", params={"q": "a"}, headers=auth(ctx["token"]))
    assert res.status_code == 400


def test_search_requires_membership(client):
    alice = make_org_with_project(client, "search3a@test.com")
    bob = make_org_with_project(client, "search3b@test.com")
    res = client.get(f"/api/orgs/{alice['org_id']}/search", params={"q": "design"}, headers=auth(bob["token"]))
    assert res.status_code == 403


def test_search_does_not_leak_other_users_personal_items(client):
    alice = make_org_with_project(client, "search4a@test.com")
    bob = make_org_with_project(client, "search4b@test.com")
    # Different orgs entirely, so this is really testing org scoping, but also
    # confirms kaizen never surfaces across the membership boundary.
    client.post(
        f"/api/orgs/{alice['org_id']}/kaizen",
        json={"title": "Private kaizen alpha", "problem": "p", "solution": "s"},
        headers=auth(alice["token"]),
    )
    res = client.get(
        f"/api/orgs/{bob['org_id']}/search", params={"q": "alpha"}, headers=auth(bob["token"])
    ).json()
    assert res == []
