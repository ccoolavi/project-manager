"""Email-based login OTP (new-device challenge) and the sensitive-action gate.

Delivery is stubbed the same way test_features.py stubs WhatsApp OTP, so the
generated code can be captured and used, without depending on SMTP being
reachable from the test environment.
"""

import re

import pytest

from conftest import auth, make_org_with_project, register


@pytest.fixture()
def captured_codes(monkeypatch):
    codes = []

    def fake_send(to, subject, body):
        match = re.search(r"\b(\d{6})\b", body)
        if match:
            codes.append(match.group(1))
        return True

    # Both auth.py (login-device) and routers/email_otp.py (sensitive-action)
    # import send_email directly, so patch it at its source.
    monkeypatch.setattr("utils.email.send_email", fake_send)
    monkeypatch.setattr("routers.auth.send_email", fake_send)
    monkeypatch.setattr("routers.email_otp.send_email", fake_send)
    return codes


def _login(client, identifier, device_id=None):
    body = {"identifier": identifier, "password": "TestPass123"}
    if device_id is not None:
        body["device_id"] = device_id
    return client.post("/api/auth/login", json=body)


def test_login_without_device_id_skips_otp(client):
    """The CLI and other non-browser clients never send device_id; gating
    those on an email challenge would make automation impossible."""
    register(client, "nodev@test.com")
    res = _login(client, "nodev@test.com")
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert not body.get("otp_required")


def test_login_with_unrecognised_device_requires_otp(client, captured_codes):
    register(client, "newdev@test.com")
    res = _login(client, "newdev@test.com", device_id="device-1")
    assert res.status_code == 200
    body = res.json()
    assert body["otp_required"] is True
    assert "access_token" not in body
    assert len(captured_codes) == 1


def test_verify_login_otp_completes_the_login_and_trusts_the_device(client, captured_codes):
    register(client, "verify@test.com")
    _login(client, "verify@test.com", device_id="device-1")

    res = client.post(
        "/api/auth/otp/email/verify-login",
        json={"identifier": "verify@test.com", "code": captured_codes[0], "device_id": "device-1"},
    )
    assert res.status_code == 200
    assert "access_token" in res.json()

    # The device is now trusted: logging in again on it skips the challenge.
    res2 = _login(client, "verify@test.com", device_id="device-1")
    assert res2.status_code == 200
    assert not res2.json().get("otp_required")


def test_wrong_login_otp_is_rejected(client, captured_codes):
    register(client, "wrongcode@test.com")
    _login(client, "wrongcode@test.com", device_id="device-1")
    res = client.post(
        "/api/auth/otp/email/verify-login",
        json={"identifier": "wrongcode@test.com", "code": "000000", "device_id": "device-1"},
    )
    assert res.status_code == 400


def test_device_trusted_at_registration_skips_first_login_otp(client):
    """Creating the account is itself proof of device control."""
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Reg",
            "email": "regdevice@test.com",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
            "device_id": "device-reg",
        },
    )
    assert res.status_code == 200

    res2 = _login(client, "regdevice@test.com", device_id="device-reg")
    assert res2.status_code == 200
    assert not res2.json().get("otp_required")


def test_a_second_device_on_a_trusted_account_still_gets_challenged(client, captured_codes):
    client.post(
        "/api/auth/register",
        json={
            "name": "Reg2",
            "email": "regdevice2@test.com",
            "password": "TestPass123",
            "confirm_password": "TestPass123",
            "device_id": "device-reg",
        },
    )
    res = _login(client, "regdevice2@test.com", device_id="device-other")
    assert res.status_code == 200
    assert res.json()["otp_required"] is True


def test_sensitive_action_blocks_project_deletion_until_verified(client, captured_codes):
    ctx = make_org_with_project(client, "sensitive1@test.com")
    project_url = f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}"

    res = client.delete(project_url, headers=auth(ctx["token"]))
    assert res.status_code == 428

    req = client.post("/api/auth/otp/email/request-action", headers=auth(ctx["token"]))
    assert req.status_code == 200
    assert req.json()["required"] is True
    assert len(captured_codes) == 1

    bad = client.post(
        "/api/auth/otp/email/verify-action", json={"code": "000000"}, headers=auth(ctx["token"])
    )
    assert bad.status_code == 400

    # Still blocked — no successful verification yet.
    res2 = client.delete(project_url, headers=auth(ctx["token"]))
    assert res2.status_code == 428

    good = client.post(
        "/api/auth/otp/email/verify-action",
        json={"code": captured_codes[0]},
        headers=auth(ctx["token"]),
    )
    assert good.status_code == 200
    assert good.json()["verified"] is True

    # Now the guarded action succeeds.
    res3 = client.delete(project_url, headers=auth(ctx["token"]))
    assert res3.status_code == 200


def test_sensitive_action_verification_also_clears_member_removal(client, captured_codes):
    """One verification opens the window for any subsequently-guarded action,
    not just the one that triggered the challenge."""
    ctx = make_org_with_project(client, "sensitive2@test.com")

    client.post("/api/auth/otp/email/request-action", headers=auth(ctx["token"]))
    client.post(
        "/api/auth/otp/email/verify-action",
        json={"code": captured_codes[0]},
        headers=auth(ctx["token"]),
    )

    # A member id that doesn't exist still proves the guard passed: 404, not 428.
    res = client.delete(
        f"/api/orgs/{ctx['org_id']}/members/999999", headers=auth(ctx["token"])
    )
    assert res.status_code == 404


def test_sensitive_action_skips_when_no_email_on_file(client):
    """A user with no email cannot be challenged, so the guard must not lock
    them out of their own data."""
    from database import get_db
    from main import app
    from models import User

    ctx = make_org_with_project(client, "noemail@test.com")

    db = next(app.dependency_overrides[get_db]())
    user = db.query(User).filter(User.email == "noemail@test.com").first()
    user.email = None
    db.commit()

    res = client.delete(
        f"/api/orgs/{ctx['org_id']}/projects/{ctx['project_id']}", headers=auth(ctx["token"])
    )
    assert res.status_code == 200


def test_login_accepts_phone_as_identifier(client):
    from database import get_db
    from main import app
    from models import User

    register(client, "phoneuser@test.com")

    db = next(app.dependency_overrides[get_db]())
    user = db.query(User).filter(User.email == "phoneuser@test.com").first()
    user.phone = "9999999999"
    db.commit()

    res = _login(client, "9999999999")
    assert res.status_code == 200
    assert "access_token" in res.json()
