"""Slowing down repeated failed sign-ins and wrong one-time codes.

Before this, /login and the code-verification routes accepted unlimited guesses as fast as the server could check them
(only bcrypt's cost slowed an attacker). The same design is used by the LMS and the mail service.

Counters are kept per ACCOUNT and per ADDRESS because either alone is easy to walk around: counting only by account lets
someone spray one guess at a thousand accounts; counting only by address lets a botnet share the work. A failure trips both.
The address counter is deliberately more generous, since several honest people can share one address.

After FREE_ATTEMPTS failures each further failure doubles the wait, up to MAX_DELAY_SECONDS. A correct answer clears the
ACCOUNT counter (never the address counter: one good login must not erase a spray against other accounts).

Held in memory, not a table: the API runs a single worker (see kaizenpm-api.service) and a restart merely resets an
attacker's delay. If it ever runs on more than one worker this must move to shared storage or it stops binding.
"""

import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, Request, status

BASE_DELAY_SECONDS = 2
MAX_DELAY_SECONDS = 300
RESET_AFTER_SECONDS = 900          # forget a key that has been quiet this long


class LoginGuard:
    def __init__(self, free_attempts: int = 5) -> None:
        self.free_attempts = free_attempts
        self._failures = defaultdict(list)

    def _recent(self, key: str, now: float):
        times = [t for t in self._failures[key] if now - t < RESET_AFTER_SECONDS]
        if times:
            self._failures[key] = times
        else:
            self._failures.pop(key, None)       # do not let a long-running process collect empty keys forever
        return times

    def retry_after(self, keys, now: Optional[float] = None) -> int:
        """Seconds the caller must wait before trying again (0 = go ahead). The strictest key wins."""
        now = time.time() if now is None else now
        worst = 0
        for key in keys:
            times = self._recent(key, now)
            if len(times) < self.free_attempts:
                continue
            over = len(times) - self.free_attempts + 1          # the first attempt past the free ones waits the base delay
            delay = min(BASE_DELAY_SECONDS * (2 ** (over - 1)), MAX_DELAY_SECONDS)
            worst = max(worst, max(0, int(delay - (now - times[-1]))))
        return worst

    def record_failure(self, keys, now: Optional[float] = None) -> None:
        now = time.time() if now is None else now
        for key in keys:
            self._failures[key].append(now)

    def clear(self, keys) -> None:
        for key in keys:
            self._failures.pop(key, None)

    def reset(self) -> None:
        self._failures.clear()


account_guard = LoginGuard(free_attempts=5)     # one person's password / code
address_guard = LoginGuard(free_attempts=25)    # one network address (shared by honest people too)


def reset_all() -> None:
    """For tests: module-level counters would otherwise leak failures from one test into the next."""
    account_guard.reset()
    address_guard.reset()


def client_address(request: Request) -> str:
    """Behind the Cloudflare tunnel the connecting peer is the local tunnel daemon; the real caller is in CF-Connecting-IP."""
    forwarded = request.headers.get("cf-connecting-ip")
    if forwarded:
        return forwarded.strip()
    return request.client.host if request.client else "unknown"


def enforce(account_keys, address_key: str) -> None:
    """Raise 429 (with Retry-After) if the caller must still wait."""
    wait = max(account_guard.retry_after(account_keys), address_guard.retry_after([address_key]))
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Please wait {wait} second{'s' if wait != 1 else ''} and try again.",
            headers={"Retry-After": str(wait)},
        )


def failed(account_keys, address_key: str) -> None:
    account_guard.record_failure(account_keys)
    address_guard.record_failure([address_key])


def succeeded(account_keys) -> None:
    account_guard.clear(account_keys)
