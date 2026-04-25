import json
import pytest
from unittest.mock import patch, MagicMock

from tests.conftest import AUTH, nodes_collection, sessions_collection, attempts_collection

TREE_ID    = "507f1f77bcf86cd799439011"
SESSION_ID = "sess-eval-test"
NODE_PATH  = "CS/SQL Injection"

QUESTION = {
    "question": "What is SQL injection?",
    "answer": [
        "Malicious SQL inserted into a query",
        "Can bypass authentication",
    ],
}

NODE = {
    "tree_id": TREE_ID,
    "node_path": NODE_PATH,
    "questions": [QUESTION],
}

SESSION = {
    "session_id": SESSION_ID,
    "tree_id": TREE_ID,
    "node_unlock_status": {NODE_PATH: "available"},
}

EVAL_REQUEST = {
    "tree_id": TREE_ID,
    "node_path": NODE_PATH,
    "question_text": QUESTION["question"],
    "user_answer": "Attackers insert SQL to bypass login.",
    "session_id": SESSION_ID,
}


def _openai_response(results: list[bool], feedback: str) -> MagicMock:
    m = MagicMock()
    m.output_text = json.dumps({"results": results, "feedback": feedback})
    return m


class TestEvaluate:
    def _setup_db(self):
        nodes_collection.find_one.return_value = NODE
        sessions_collection.find_one.return_value = SESSION
        attempts_collection.find.return_value = []

    def test_returns_marks_received_and_total(self, client):
        self._setup_db()

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(
                [True, False], "Good start."
            )
            response = client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)

        assert response.status_code == 200
        data = response.json()
        assert data["marks_received"] == 1
        assert data["marks_total"] == 2

    def test_full_marks_when_all_key_points_hit(self, client):
        self._setup_db()

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(
                [True, True], "Excellent answer."
            )
            response = client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)

        data = response.json()
        assert data["marks_received"] == data["marks_total"]

    def test_zero_marks_when_no_key_points_hit(self, client):
        self._setup_db()

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(
                [False, False], "Try again."
            )
            response = client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)

        assert response.json()["marks_received"] == 0

    def test_returns_key_points_hit(self, client):
        self._setup_db()

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(
                [True, False], "Good start."
            )
            response = client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)

        data = response.json()
        assert QUESTION["answer"][0] in data["key_points_hit"]
        assert QUESTION["answer"][1] not in data["key_points_hit"]

    def test_returns_feedback_string(self, client):
        self._setup_db()

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(
                [True, False], "Good start, but mention authentication bypass."
            )
            response = client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)

        assert response.json()["feedback"] == "Good start, but mention authentication bypass."

    def test_unknown_question_returns_error(self, client):
        nodes_collection.find_one.return_value = NODE

        with patch("routes.evaluate.OpenAI"):
            response = client.post(
                "/evaluate",
                json={**EVAL_REQUEST, "question_text": "A question not in the node."},
                headers=AUTH,
            )

        assert "error" in response.json()

    def test_attempt_is_stored_after_evaluation(self, client):
        self._setup_db()

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(
                [True, True], "Perfect."
            )
            client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)

        attempts_collection.insert_one.assert_called_once()
        attempt = attempts_collection.insert_one.call_args[0][0]
        assert attempt["session_id"] == SESSION_ID
        assert attempt["marks_received"] == 2
        assert attempt["marks_total"] == 2

    def test_requires_auth(self, client):
        response = client.post("/evaluate", json=EVAL_REQUEST)
        assert response.status_code in (401, 422)

    def test_openai_returns_malformed_json_raises_error(self, client):
        self._setup_db()
        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            m = MagicMock()
            m.output_text = "not valid json {"
            MockOpenAI.return_value.responses.create.return_value = m
            with pytest.raises(Exception):
                client.post("/evaluate", json=EVAL_REQUEST, headers=AUTH)
