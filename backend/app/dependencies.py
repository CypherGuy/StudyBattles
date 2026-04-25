from collections import defaultdict
from time import time

from fastapi import HTTPException, Request

from config import settings


_store: dict[str, list[float]] = defaultdict(list)


def make_rate_limiter(max_requests: int, window_seconds: int):
    def limiter(request: Request):
        ip = request.client.host if request.client else "unknown"
        whitelisted = {s.strip() for s in settings.whitelisted_ips.split(",") if s.strip()}
        if ip in whitelisted:
            return
        key = f"{ip}:{request.url.path}"
        now = time()
        _store[key] = [t for t in _store[key] if now - t < window_seconds]
        if len(_store[key]) >= max_requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please wait before trying again.")
        _store[key].append(now)
    return limiter
