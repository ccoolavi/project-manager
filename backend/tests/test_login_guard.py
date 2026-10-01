"""Repeated wrong passwords and wrong one-time codes are slowed down, per account and per address."""

import re

import pytest

from conftest import register
from utils import login_guard


@pytest.fixture()
def captured_codes(monkeypatch):
    codes = []

    def fake_send(to, subject, body):
        match = re.search(r"\b(\d{6})\b", body)
        if match:
            codes.append(match.group(1))
        return True

    monkeypatch.setattr("utils.email.send_email", fake_send)
    monkeypatch.setattr("routers.auth.send_email", fake_send)
    monkeypatch.setattr("routers.email_otp.send_email", fake_send)
    return codes


def _login(client, email, password, device_id=None, headers=None):
    body = {"identifier": email, "password": password}
    if device_id:
        body["device_id"] = device_id
    return client.post("/api/auth/login", json=body, headers=headers or {})


def test_five_wrong_passwords_are_free_then_the_next_attempt_must_wait(client):
    register(client, "guard1@test.com")
    for _ in range(5):
        assert _login(client, "guard1@test.com", "wrong-password").status_code == 401
    blocked = _login(client, "guard1@test.com", "wrong-password")
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1
    assert "wait" in blocked.json()["detail"].lower()
    # even the CORRECT password is refused during the wait: otherwise guessing would simply continue
    assert _login(client, "guard1@test.com", "TestPass123").status_code == 429


def test_the_wait_ends_and_a_good_login_clears_the_slate(client, monkeypatch):
    register(client, "guard2@test.com")
    clock = [1_000_000.0]
    monkeypatch.setattr(login_guard.time, "time", lambda: clock[0])
    for _ in range(6):
        _login(client, "guard2@test.com", "nope")
    assert _login(client, "guard2@test.com", "TestPass123").status_code == 429
    clock[0] += 400                                           # longer than the longest possible wait
    assert _login(client, "guard2@test.com", "TestPass123").status_code == 200
    for _ in range(5):                                        # the slate is clean: five more free failures
        assert _login(client, "guard2@test.com", "nope").status_code == 401


def test_one_accounts_failures_do_not_lock_out_another(client):
    register(client, "guard3a@test.com")
    register(client, "guard3b@test.com")
    for _ in range(7):
        _login(client, "guard3a@test.com", "nope")
    assert _login(client, "guard3a@test.com", "TestPass123").status_code == 429
    assert _login(client, "guard3b@test.com", "TestPass123").status_code == 200


def test_spraying_one_guess_at_many_accounts_trips_the_address_counter(client):
    for i in range(login_guard.address_guard.free_attempts):
        assert _login(client, f"nobody{i}@test.com", "x", headers={"CF-Connecting-IP": "203.0.113.9"}).status_code == 401
    assert _login(client, "another@test.com", "x", headers={"CF-Connecting-IP": "203.0.113.9"}).status_code == 429
    # a different caller (different real address) is unaffected
    assert _login(client, "another@test.com", "x", headers={"CF-Connecting-IP": "198.51.100.7"}).status_code == 401


def test_wrong_login_codes_are_throttled_too(client, captured_codes):
    register(client, "guard5@test.com")
    _login(client, "guard5@test.com", "TestPass123", device_id="new-phone")          # issues a code
    assert len(captured_codes) == 1
    for _ in range(5):
        res = client.post("/api/auth/otp/email/verify-login",
                          json={"identifier": "guard5@test.com", "code": "000000", "device_id": "new-phone"})
        assert res.status_code == 400
    res = client.post("/api/auth/otp/email/verify-login",
                      json={"identifier": "guard5@test.com", "code": captured_codes[0], "device_id": "new-phone"})
    assert res.status_code == 429                                                    # even the right code must wait


def test_wrong_action_codes_are_throttled_too(client, captured_codes):
    token = register(client, "guard6@test.com")
    h = {"Authorization": f"Bearer {token}"}
    client.post("/api/auth/otp/email/request-action", headers=h)
    for _ in range(5):
        assert client.post("/api/auth/otp/email/verify-action", json={"code": "000000"}, headers=h).status_code == 400
    assert client.post("/api/auth/otp/email/verify-action", json={"code": "000000"}, headers=h).status_code == 429
