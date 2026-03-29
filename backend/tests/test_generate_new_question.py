import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TREE_ID = "507f1f77bcf86cd799439011"
DOC_ID  = "507f1f77bcf86cd799439012"

MOCK_QUESTION = {
    "type": "Definition",
    "question": "What is SQL injection?",
    "answer": ["A technique where malicious SQL is inserted into a query"],
}

EXISTING_QUESTION = {
    "type": "Application",
    "question": "Give an example of a SQL injection attack.",
    "answer": ["Entering ' OR 1=1-- into a login field bypasses authentication"],
}


def make_openai_response(question: dict) -> MagicMock:
    mock_response = MagicMock()
    mock_response.output_text = json.dumps({"questions": [question]})
    return mock_response


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGenerateNewQuestion:
    def setup_method(self):
        """Patch all external dependencies before each test."""
        # Patch DB collections and OpenAI before importing the app
        self.db_patch = patch.dict("sys.modules", {
            "db": MagicMock(
                nodes_collection=MagicMock(),
                trees_collection=MagicMock(),
                documents_collection=MagicMock(),
                sessions_collection=MagicMock(),
                attempts_collection=MagicMock(),
            )
        })
        self.db_patch.start()

        from app.main import app
        self.client = TestClient(app)

    def teardown_method(self):
        self.db_patch.stop()

    def test_returns_a_new_question(self):
        """Endpoint returns a single generated question object."""
        import db as mock_db

        mock_db.trees_collection.find_one.return_value = {"_id": TREE_ID, "document_id": DOC_ID}
        mock_db.documents_collection.find_one.return_value = {"extracted_text": "Some study notes about SQL injection."}

        with patch("routes.generate_questions.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = make_openai_response(MOCK_QUESTION)

            response = self.client.post(
                f"/api/questions/{TREE_ID}/Security%2FSQL%20Injection/generate-new",
                json={"existing_questions": [EXISTING_QUESTION["question"]]},
            )

        assert response.status_code == 200
        data = response.json()
        assert "question" in data
        assert data["question"]["question"] == MOCK_QUESTION["question"]
        assert data["question"]["type"] == MOCK_QUESTION["type"]

    def test_existing_questions_passed_to_prompt_to_avoid_duplicates(self):
        """The prompt sent to OpenAI includes existing question texts so duplicates are avoided."""
        import db as mock_db

        mock_db.trees_collection.find_one.return_value = {"_id": TREE_ID, "document_id": DOC_ID}
        mock_db.documents_collection.find_one.return_value = {"extracted_text": "Study notes."}

        with patch("routes.generate_questions.OpenAI") as MockOpenAI:
            mock_create = MockOpenAI.return_value.responses.create
            mock_create.return_value = make_openai_response(MOCK_QUESTION)

            self.client.post(
                f"/api/questions/{TREE_ID}/Security%2FSQL%20Injection/generate-new",
                json={"existing_questions": [EXISTING_QUESTION["question"]]},
            )

            prompt_used = mock_create.call_args[1]["input"]
            assert EXISTING_QUESTION["question"] in prompt_used
