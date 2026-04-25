import json
import pytest
from unittest.mock import patch

from tests.conftest import trees_collection, documents_collection

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

URL = f"/api/questions/{TREE_ID}/Security%2FSQL%20Injection/generate-new"


def make_openai_response(question: dict):
    from unittest.mock import MagicMock
    m = MagicMock()
    m.output_text = json.dumps({"questions": [question]})
    return m


class TestGenerateNewQuestion:
    def test_returns_a_new_question(self, client):
        trees_collection.find_one.return_value = {"_id": TREE_ID, "document_id": DOC_ID}
        documents_collection.find_one.return_value = {"extracted_text": "Some SQL injection notes."}

        with patch("routes.generate_questions.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = make_openai_response(MOCK_QUESTION)
            response = client.post(URL, json={"existing_questions": [EXISTING_QUESTION["question"]]})

        assert response.status_code == 200
        data = response.json()
        assert "question" in data
        assert data["question"]["question"] == MOCK_QUESTION["question"]
        assert data["question"]["type"] == MOCK_QUESTION["type"]

    def test_existing_questions_passed_to_prompt_to_avoid_duplicates(self, client):
        trees_collection.find_one.return_value = {"_id": TREE_ID, "document_id": DOC_ID}
        documents_collection.find_one.return_value = {"extracted_text": "Study notes."}

        with patch("routes.generate_questions.OpenAI") as MockOpenAI:
            mock_create = MockOpenAI.return_value.responses.create
            mock_create.return_value = make_openai_response(MOCK_QUESTION)
            client.post(URL, json={"existing_questions": [EXISTING_QUESTION["question"]]})
            prompt_used = mock_create.call_args.kwargs["input"]

        assert EXISTING_QUESTION["question"] in prompt_used

    def test_response_includes_answer_array(self, client):
        trees_collection.find_one.return_value = {"_id": TREE_ID, "document_id": DOC_ID}
        documents_collection.find_one.return_value = {"extracted_text": "Notes."}

        with patch("routes.generate_questions.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = make_openai_response(MOCK_QUESTION)
            response = client.post(URL, json={"existing_questions": []})

        assert isinstance(response.json()["question"]["answer"], list)
        assert len(response.json()["question"]["answer"]) >= 1

