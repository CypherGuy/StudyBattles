"""
Rate-limiter tests.  Each test creates its own minimal FastAPI app so it
is fully isolated from the rest of the suite and from MongoDB mocks.
The _store dict is cleared before every test via the autouse fixture in
conftest.py (added alongside these tests).
"""
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from unittest.mock import patch

from dependencies import make_rate_limiter


def _app_with_limit(max_requests: int, window_seconds: int):
    """Minimal app with a single /ping route under the given rate limit."""
    app = FastAPI()

    @app.get("/ping", dependencies=[Depends(make_rate_limiter(max_requests, window_seconds))])
    def ping():
        return {"ok": True}

    return TestClient(app)


class TestRateLimiter:
    def test_requests_within_limit_succeed(self):
        with patch("dependencies.settings") as s:
            s.whitelisted_ips = ""
            client = _app_with_limit(3, 3600)
            for _ in range(3):
                assert client.get("/ping").status_code == 200

    def test_request_over_limit_returns_429(self):
        with patch("dependencies.settings") as s:
            s.whitelisted_ips = ""
            client = _app_with_limit(3, 3600)
            for _ in range(3):
                client.get("/ping")
            resp = client.get("/ping")
            assert resp.status_code == 429

    def test_429_response_has_detail_message(self):
        with patch("dependencies.settings") as s:
            s.whitelisted_ips = ""
            client = _app_with_limit(1, 3600)
            client.get("/ping")
            resp = client.get("/ping")
            assert resp.status_code == 429
            assert "detail" in resp.json()

    def test_whitelisted_ip_bypasses_limit(self):
        # testclient is the host TestClient presents; whitelisting it means
        # no limit applies even at max_requests=1.
        with patch("dependencies.settings") as s:
            s.whitelisted_ips = "testclient"
            client = _app_with_limit(1, 3600)
            for _ in range(5):
                assert client.get("/ping").status_code == 200

    def test_non_whitelisted_ip_is_still_rate_limited(self):
        # Explicit empty whitelist — TestClient IP (testclient) should be limited.
        with patch("dependencies.settings") as s:
            s.whitelisted_ips = "192.168.1.1"
            client = _app_with_limit(1, 3600)
            client.get("/ping")
            assert client.get("/ping").status_code == 429

    def test_different_paths_have_separate_counters(self):
        with patch("dependencies.settings") as s:
            s.whitelisted_ips = ""
            from dependencies import make_rate_limiter
            app = FastAPI()
            limiter = make_rate_limiter(1, 3600)

            @app.get("/ping", dependencies=[Depends(limiter)])
            def ping():
                return {"ok": True}

            @app.get("/pong", dependencies=[Depends(limiter)])
            def pong():
                return {"ok": True}

            client = TestClient(app)
            assert client.get("/ping").status_code == 200
            assert client.get("/pong").status_code == 200
            assert client.get("/ping").status_code == 429
            assert client.get("/pong").status_code == 429
