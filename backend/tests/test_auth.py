"""
Tests for authentication/access behaviour after password gate removal.
Routes that previously required a Bearer token must now be open, and
the /auth/verify endpoint must no longer exist.
"""
import pytest
from tests.conftest import client  # noqa: F401 (fixture re-export)


class TestAuth:
    def test_health_endpoint_requires_no_auth(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_auth_verify_endpoint_is_removed(self, client):
        response = client.post("/auth/verify", json={"password": "anything"})
        assert response.status_code == 404

    def test_generate_tree_accessible_without_auth(self):
        # Without any Authorization header the route must not return 401.
        # raise_server_exceptions=False lets unhandled route errors become 500s
        # instead of propagating — we only care that it isn't 401.
        from fastapi.testclient import TestClient
        from main import app
        from tests.conftest import documents_collection
        documents_collection.find_one.return_value = None
        no_raise = TestClient(app, raise_server_exceptions=False)
        response = no_raise.post("/generate-tree?document_id=507f1f77bcf86cd799439011")
        assert response.status_code != 401

    def test_upload_accessible_without_auth(self, client):
        import io
        from docx import Document
        buf = io.BytesIO()
        Document().save(buf)
        from tests.conftest import documents_collection
        documents_collection.insert_one.return_value.inserted_id = "abc123"
        response = client.post(
            "/upload",
            files={"files": ("notes.docx", io.BytesIO(buf.getvalue()), "application/octet-stream")},
        )
        assert response.status_code != 401

    def test_evaluate_accessible_without_auth(self, client):
        response = client.post("/evaluate", json={})
        assert response.status_code != 401
