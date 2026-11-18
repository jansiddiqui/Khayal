"""In-memory rate limits per client address (no extra dependency), for the public demo.

Each limit allows `limit` requests per sliding `window`. The counts live in this process
only, which is fine for one small server; they reset when it restarts. The client address
comes from the proxy's X-Forwarded-For header, which uvicorn applies when started with
--proxy-headers (see docs/DEPLOY-VOROA.md).
"""

import threading
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class SlidingWindowLimiter:
    limit: int
    window: timedelta
    _hits: dict[str, deque[datetime]] = field(default_factory=lambda: defaultdict(deque))
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def hit(self, key: str, now: datetime) -> float | None:
        """Count one request. Returns None if allowed, else seconds until the next one is."""
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                return max(1.0, (q[0] + self.window - now).total_seconds())
            q.append(now)
            return None

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()

    def prune(self, now: datetime) -> None:
        """Forget addresses with no recent requests, so memory stays small."""
        with self._lock:
            for key in [k for k, q in self._hits.items() if not q or q[-1] <= now - self.window]:
                del self._hits[key]


LIMITS: dict[str, SlidingWindowLimiter] = {
    # Creating accounts: a few per address per hour.
    "register": SlidingWindowLimiter(5, timedelta(hours=1)),
    "demo": SlidingWindowLimiter(5, timedelta(hours=1)),
    # Signing in: room for typos, not for guessing passwords.
    "login": SlidingWindowLimiter(10, timedelta(minutes=5)),
    # Pairing codes: on top of the wrong-code limit in services/pairing.py.
    "pair": SlidingWindowLimiter(20, timedelta(minutes=10)),
    # "Request an invite" on the landing page.
    "invite": SlidingWindowLimiter(5, timedelta(hours=1)),
    # Full backups (admin page): heavy, so one per 10 minutes for the whole server.
    "backup": SlidingWindowLimiter(1, timedelta(minutes=10)),
    # "Send feedback": plenty for real use, not for flooding the inbox.
    "feedback": SlidingWindowLimiter(10, timedelta(hours=1)),
    # Research exports (admin page).
    "research": SlidingWindowLimiter(5, timedelta(hours=1)),
}


def clear_all() -> None:
    for limiter in LIMITS.values():
        limiter.clear()


def prune_all(now: datetime) -> None:
    for limiter in LIMITS.values():
        limiter.prune(now)
