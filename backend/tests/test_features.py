"""Habits, time, kaizen and the OTP flow."""

from datetime import datetime, timedelta

import pytest

from conftest import auth, make_org_with_project


def test_habit_check_in_persists(client):
    """A JSON column mutated in place is not saved unless it is a MutableList."""
    ctx = make_org_with_project(client, "habit@test.com")
    habit = client.post(
        f"/api/orgs/{ctx['org_id']}/habits",
        json={"title": "Exercise", "category": "health", "target_days": 7},
        headers=auth(ctx["token"]),
    ).json()

    client.post(
        f"/api/orgs/{ctx['org_id']}/habits/{habit['id']}/check", headers=auth(ctx["token"])
    )

    reread = client.get(
        f"/api/orgs/{ctx['org_id']}/habits", headers=auth(ctx["token"])
    ).json()[0]
    assert reread["streak"] == 1
    assert len(reread["completed_dates"]) == 1


def test_habit_check_in_is_idempotent_within_a_day(client):
    ctx = make_org_with_project(client, "habit2@test.com")
    habit = client.post(
        f"/api/orgs/{ctx['org_id']}/habits",
        json={"title": "Read", "target_days": 7},
        headers=auth(ctx["token"]),
    ).json()

    for _ in range(3):
        client.post(
            f"/api/orgs/{ctx['org_id']}/habits/{habit['id']}/check",
            headers=auth(ctx["token"]),
        )

    reread = client.get(
        f"/api/orgs/{ctx['org_id']}/habits", headers=auth(ctx["token"])
    ).json()[0]
    assert reread["streak"] == 1, "checking in twice in one day must not inflate the streak"


def test_time_entry_round_trip(client):
    ctx = make_org_with_project(client, "time@test.com")
    res = client.post(
        f"/api/orgs/{ctx['org_id']}/time",
        json={"duration_minutes": 45, "category": "development"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200
    entries = client.get(
        f"/api/orgs/{ctx['org_id']}/time", headers=auth(ctx["token"])
    ).json()
    assert len(entries) == 1
    assert entries[0]["duration_minutes"] == 45


def test_time_entry_rejects_nonsense_duration(client):
    ctx = make_org_with_project(client, "time2@test.com")
    res = client.post(
        f"/api/orgs/{ctx['org_id']}/time",
        json={"duration_minutes": 0},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 400


def test_kaizen_round_trip_and_delete(client):
    ctx = make_org_with_project(client, "kaizen@test.com")
    log = client.post(
        f"/api/orgs/{ctx['org_id']}/kaizen",
        json={"title": "Batch email", "problem": "switching", "solution": "two windows"},
        headers=auth(ctx["token"]),
    ).json()
    assert client.get(
        f"/api/orgs/{ctx['org_id']}/kaizen", headers=auth(ctx["token"])
    ).json()

    client.delete(
        f"/api/orgs/{ctx['org_id']}/kaizen/{log['id']}", headers=auth(ctx["token"])
    )
    assert client.get(
        f"/api/orgs/{ctx['org_id']}/kaizen", headers=auth(ctx["token"])
    ).json() == []


def test_task_moves_across_the_board(client):
    ctx = make_org_with_project(client, "task@test.com")
    base = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}/tasks/{ctx['sub_id']}"
    task = client.post(
        base,
        json={"title": "Design", "status": "todo", "priority": "high"},
        headers=auth(ctx["token"]),
    ).json()

    for status in ("in_progress", "review", "done"):
        res = client.put(
            f"{base}/{task['id']}", json={"status": status}, headers=auth(ctx["token"])
        )
        assert res.status_code == 200
        assert res.json()["status"] == status


# --- OTP -------------------------------------------------------------------
#
# Delivery is stubbed so the test can capture the generated code. This exercises
# every part of the flow except the WhatsApp bridge itself, which is a separate
# process and is not always running on this box.


@pytest.fixture()
def captured_codes(monkeypatch):
    codes = []

    async def fake_send(phone, message):
        import re

        match = re.search(r"\b(\d{6})\b", message)
        if match:
            codes.append(match.group(1))
        return True

    monkeypatch.setattr("routers.otp.send_whatsapp", fake_send)
    return codes


def test_otp_request_and_verify(client, captured_codes):
    ctx = make_org_with_project(client, "otp@test.com")
    res = client.post(
        "/api/auth/otp/request", json={"phone": "+91 90000 00001"}, headers=auth(ctx["token"])
    )
    assert res.status_code == 200
    assert res.json()["delivered"] is True
    assert len(captured_codes) == 1

    res = client.post(
        "/api/auth/otp/verify",
        json={"phone": "+91 90000 00001", "code": captured_codes[0]},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 200
    assert res.json()["verified"] is True

    status = client.get("/api/auth/otp/status", headers=auth(ctx["token"])).json()
    assert status["verified"] is True
    assert status["phone"] == "919000000001"


def test_otp_wrong_code_is_rejected(client, captured_codes):
    ctx = make_org_with_project(client, "otp2@test.com")
    client.post(
        "/api/auth/otp/request", json={"phone": "9000000002"}, headers=auth(ctx["token"])
    )
    res = client.post(
        "/api/auth/otp/verify",
        json={"phone": "9000000002", "code": "000000"},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 400


def test_otp_cannot_be_reused(client, captured_codes):
    ctx = make_org_with_project(client, "otp3@test.com")
    client.post(
        "/api/auth/otp/request", json={"phone": "9000000003"}, headers=auth(ctx["token"])
    )
    body = {"phone": "9000000003", "code": captured_codes[0]}
    assert client.post("/api/auth/otp/verify", json=body, headers=auth(ctx["token"])).status_code == 200
    assert client.post("/api/auth/otp/verify", json=body, headers=auth(ctx["token"])).status_code == 400


def test_otp_is_rate_limited(client, captured_codes):
    ctx = make_org_with_project(client, "otp4@test.com")
    for _ in range(3):
        assert client.post(
            "/api/auth/otp/request",
            json={"phone": "9000000004"},
            headers=auth(ctx["token"]),
        ).status_code == 200
    res = client.post(
        "/api/auth/otp/request", json={"phone": "9000000004"}, headers=auth(ctx["token"])
    )
    assert res.status_code == 429


def test_otp_rejects_a_nonsense_number(client, captured_codes):
    ctx = make_org_with_project(client, "otp5@test.com")
    res = client.post(
        "/api/auth/otp/request", json={"phone": "123"}, headers=auth(ctx["token"])
    )
    assert res.status_code == 400


def test_expired_otp_is_rejected(client, captured_codes):
    from models import OTPSession

    ctx = make_org_with_project(client, "otp6@test.com")
    client.post(
        "/api/auth/otp/request", json={"phone": "9000000006"}, headers=auth(ctx["token"])
    )

    # Age the code past its TTL using the app's own session.
    from database import get_db
    from main import app

    db = next(app.dependency_overrides[get_db]())
    session = db.query(OTPSession).filter(OTPSession.phone == "9000000006").first()
    session.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()

    res = client.post(
        "/api/auth/otp/verify",
        json={"phone": "9000000006", "code": captured_codes[0]},
        headers=auth(ctx["token"]),
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"].lower()


def test_otp_requires_authentication(client):
    assert client.post("/api/auth/otp/request", json={"phone": "9000000007"}).status_code == 403
