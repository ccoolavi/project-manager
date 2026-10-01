"""Idempotent writes.

The web app sends an ``Idempotency-Key`` header with every create/update/delete. If the same key arrives again for the same
user and request, the answer recorded the first time is returned and nothing is executed a second time. That makes it safe
for the client to retry (for example after the API address changed mid-request) and to replay requests it parked while
offline, without ever creating a duplicate task or project.

Only successful (2xx) answers are recorded, so a request that failed can still be retried for real. Authentication routes are
never recorded: their answers contain tokens.
"""
from datetime import datetime, timedelta

from fastapi import Request, Response
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import IdempotencyKey
from utils.security import decode_token

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
MAX_KEY_LENGTH = 128
KEEP_FOR = timedelta(days=7)


def _open_session(request: Request):
    """Use the same session factory the routes use (so tests that override get_db stay isolated)."""
    getter = request.app.dependency_overrides.get(get_db, get_db)
    gen = getter()
    return next(gen), gen


def _close_session(gen):
    try:
        next(gen)
    except StopIteration:
        pass


async def idempotency_middleware(request: Request, call_next):
    key = request.headers.get("idempotency-key")
    if not key or request.method not in WRITE_METHODS or len(key) > MAX_KEY_LENGTH:
        return await call_next(request)
    if request.url.path.startswith("/api/auth/"):
        return await call_next(request)

    auth = request.headers.get("authorization", "")
    payload = decode_token(auth[7:]) if auth.lower().startswith("bearer ") else None
    try:
        user_id = int(payload["sub"]) if payload and payload.get("sub") is not None else None
    except (TypeError, ValueError):
        user_id = None
    if user_id is None:
        return await call_next(request)  # not signed in: the route will answer 401 as usual

    path = request.url.path + (f"?{request.url.query}" if request.url.query else "")
    db, gen = _open_session(request)
    try:
        seen = (
            db.query(IdempotencyKey)
            .filter_by(user_id=user_id, key=key, method=request.method, path=path)
            .first()
        )
        if seen:
            return Response(
                content=(seen.body or "").encode("utf-8"),
                status_code=seen.status_code,
                media_type=seen.content_type or "application/json",
                headers={"Idempotent-Replay": "true"},
            )
    finally:
        _close_session(gen)

    response = await call_next(request)
    if not 200 <= response.status_code < 300:
        return response

    body = b"".join([chunk async for chunk in response.body_iterator])
    db, gen = _open_session(request)
    try:
        db.query(IdempotencyKey).filter(IdempotencyKey.created_at < datetime.utcnow() - KEEP_FOR).delete()
        db.add(
            IdempotencyKey(
                key=key,
                user_id=user_id,
                method=request.method,
                path=path,
                status_code=response.status_code,
                body=body.decode("utf-8", errors="replace"),
                content_type=response.headers.get("content-type"),
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # a simultaneous twin already recorded this key; both answers are equivalent
    finally:
        _close_session(gen)

    headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
    return Response(content=body, status_code=response.status_code, headers=headers)
