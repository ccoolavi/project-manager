import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Base, get_db  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture()
def client():
    """A TestClient backed by a throwaway SQLite file, isolated per test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()
    os.unlink(path)


def register(client, email, name="Test User", password="TestPass123"):
    res = client.post(
        "/api/auth/register",
        json={
            "name": name,
            "email": email,
            "password": password,
            "confirm_password": password,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def login(client, email, password="TestPass123"):
    res = client.post("/api/auth/login", json={"identifier": email, "password": password})
    assert res.status_code == 200, res.text
    body = res.json()
    assert not body.get("otp_required"), "login unexpectedly required an OTP challenge"
    return body["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_org_with_project(client, email):
    """Register a user and give them an org, project and section. Returns ids + token."""
    register(client, email)
    token = login(client, email)
    org = client.post("/api/orgs", json={"name": f"Org {email}"}, headers=auth(token)).json()
    token = login(client, email)  # re-issue so the JWT carries org claims
    project = client.post(
        f"/api/orgs/{org['id']}/projects",
        json={"name": "P", "status": "active"},
        headers=auth(token),
    ).json()
    sub = client.post(
        f"/api/orgs/{org['id']}/projects/{project['id']}/sub-projects",
        json={"name": "S", "status": "active"},
        headers=auth(token),
    ).json()
    return {
        "token": token,
        "org_id": org["id"],
        "project_id": project["id"],
        "sub_id": sub["id"],
    }
