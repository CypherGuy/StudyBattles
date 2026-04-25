import pytest
from tests.conftest import AUTH, client  # noqa: F401 (fixture re-export)
from dependencies import VALID_TOKEN
from config import settings


class TestAuth:
    def test_correct_password_returns_token(self, client):
        response = client.post("/auth/verify", json={"password": settings.access_password})
        assert response.status_code == 200
        assert response.json()["token"] == VALID_TOKEN

    def test_wrong_password_returns_401(self, client):
        response = client.post("/auth/verify", json={"password": "wrong-password"})
        assert response.status_code == 401

    def test_missing_password_returns_422(self, client):
        response = client.post("/auth/verify", json={})
        assert response.status_code == 422

    def test_health_endpoint_requires_no_auth(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_protected_endpoint_without_auth_is_rejected(self, client):
        response = client.post("/generate-tree?document_id=abc")
        assert response.status_code in (401, 422)

    def test_protected_endpoint_with_invalid_token_returns_401(self, client):
        response = client.post(
            "/generate-tree?document_id=abc",
            headers={"Authorization": "Bearer totally-wrong-token"},
        )
        assert response.status_code == 401

    def test_protected_endpoint_with_valid_token_is_accepted(self, client):
        from tests.conftest import documents_collection
        from unittest.mock import patch, MagicMock

        documents_collection.find_one.return_value = {
            "_id": "507f1f77bcf86cd799439011",
            "extracted_text": "notes",
            "file_type": "docx",
            "name": "notes.docx",
        }

        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            m = MagicMock()
            m.output_text = '{"title":"Root","children":[]}'
            MockOpenAI.return_value.responses.create.return_value = m

            from tests.conftest import trees_collection, nodes_collection
            trees_collection.insert_one.return_value.inserted_id = "507f1f77bcf86cd799439099"
            nodes_collection.insert_one.return_value = MagicMock()
            documents_collection.update_one.return_value = MagicMock()

            response = client.post(
                "/generate-tree?document_id=507f1f77bcf86cd799439011",
                headers=AUTH,
            )

        assert response.status_code == 200
