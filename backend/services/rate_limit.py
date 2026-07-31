"""
Lightweight in-process rate limiting (no extra dependency, no Redis).

Why this exists
---------------
Without a limiter, ``/api/auth/login`` can be hammered with thousands of
password guesses per minute and ``/api/cards/upload`` can be used to burn all
the CPU/OCR capacity of the box. Both are the classic ways a small SaaS gets
taken down on day one.

Design
------
A sliding-window counter kept in a dict, keyed by ``(bucket, client)``. The app
runs as a single Uvicorn process on one instance (Render/Docker single
container), so in-process state is exactly as accurate as a shared store would
be — and it costs nothing. If CardVault is ever scaled to several instances,
swap ``_HITS`` for Redis; the public API of this module stays the same.

Usage::

    @router.post("/login", dependencies=[Depends(rate_limit("login", 10, 300))])

Failed logins are additionally counted per *account* in :func:`too_many_failures`
so an attacker can't dodge the IP limit by rotating proxies.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

# bucket -> client key -> deque of hit timestamps
_HITS: dict[str, dict[str, deque[float]]] = defaultdict(lambda: defaultdict(deque))
_LOCK = threading.Lock()
_last_sweep = 0.0

# Allow turning the limiter off for local development / load tests.
ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "false"


def client_key(request: Request) -> str:
    """Best-effort client identity.

    Behind Render/Fly/nginx the socket peer is the proxy, so prefer the first
    entry of ``X-Forwarded-For`` (the original client) and fall back to the peer.
    """
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip", "")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    """Drop empty buckets occasionally so memory can't creep up forever."""
    global _last_sweep
    if now - _last_sweep < 300:
        return
    _last_sweep = now
    for bucket, clients in list(_HITS.items()):
        for key, hits in list(clients.items()):
            if not hits or now - hits[-1] > 3600:
                clients.pop(key, None)
        if not clients:
            _HITS.pop(bucket, None)


def hit(bucket: str, key: str, limit: int, window_s: int) -> tuple[bool, int]:
    """Record one hit. Returns ``(allowed, retry_after_seconds)``."""
    if not ENABLED:
        return True, 0
    now = time.time()
    with _LOCK:
        _sweep(now)
        hits = _HITS[bucket][key]
        cutoff = now - window_s
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= limit:
            return False, max(1, int(window_s - (now - hits[0])))
        hits.append(now)
        return True, 0


def reset(bucket: str, key: str) -> None:
    """Clear a counter — called after a *successful* login so a legitimate user
    who fat-fingered their password a few times isn't punished afterwards."""
    with _LOCK:
        _HITS.get(bucket, {}).pop(key, None)


def rate_limit(bucket: str, limit: int, window_s: int):
    """FastAPI dependency enforcing ``limit`` requests per ``window_s`` per client."""

    def _dep(request: Request) -> None:
        allowed, retry_after = hit(bucket, client_key(request), limit, window_s)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Zu viele Anfragen. Bitte warte einen Moment und versuch es erneut.",
                headers={"Retry-After": str(retry_after)},
            )

    return _dep


def too_many_failures(identifier: str, limit: int = 10, window_s: int = 900) -> bool:
    """Count a failed login for an account (not an IP). Returns True once the
    account should be temporarily locked out."""
    allowed, _ = hit("login_account", identifier.lower(), limit, window_s)
    return not allowed


def clear_failures(identifier: str) -> None:
    reset("login_account", identifier.lower())
