"""
End-to-end workflow tests.

Each test class exercises a complete user journey through the API:
  upload → generate tree → create session → fetch questions → evaluate → check unlock
"""
import io
import json
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId

from tests.conftest import (
    AUTH,
    documents_collection,
    trees_collection,
    nodes_collection,
    sessions_collection,
    attempts_collection,
)


# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

TREE_HIERARCHY = {
    "title": "Networking",
    "children": [
        {"title": "TCPIP", "children": []},
        {"title": "DNS",   "children": []},
    ],
}

QUESTION = {
    "type": "Definition",
    "question": "What is TCPIP?",
    "answer": ["A suite of communication protocols", "Used on the internet"],
}


def _openai_tree_response():
    m = MagicMock()
    m.output_text = json.dumps(TREE_HIERARCHY)
    return m


def _openai_eval_response(results, feedback):
    m = MagicMock()
    m.output_text = json.dumps({"results": results, "feedback": feedback})
    return m


class TestFullHappyPath:
    """
    Simulates a user going from uploading a document all the way to
    beating a leaf node and unlocking its parent.
    """

    TREE_ID     = "aaaaaaaaaaaaaaaaaaaaaaaa"
    DOC_ID      = "bbbbbbbbbbbbbbbbbbbbbbbb"
    SESSION_ID  = "workflow-session-001"
    LEAF_PATH   = "Networking/TCPIP"
    LEAF_PATH_2 = "Networking/DNS"
    ROOT_PATH   = "Networking"

    def test_upload_then_generate_tree(self, client):
        """Uploading a document and generating a tree succeeds end-to-end."""
        from docx import Document as DocxDoc
        buf = io.BytesIO()
        doc = DocxDoc()
        doc.add_paragraph("Networking fundamentals: TCPIP and DNS.")
        doc.save(buf)

        documents_collection.insert_one.return_value.inserted_id = ObjectId(self.DOC_ID)
        response = client.post(
            "/upload",
            files={"files": ("notes.docx", io.BytesIO(buf.getvalue()), "application/octet-stream")},
            headers=AUTH,
        )
        assert response.status_code == 200
        doc_id = response.json()["document_id"]

        documents_collection.find_one.return_value = {
            "_id": ObjectId(doc_id),
            "extracted_text": "Networking fundamentals: TCPIP and DNS.",
            "file_type": "docx",
            "name": "notes.docx",
        }
        trees_collection.insert_one.return_value.inserted_id = ObjectId(self.TREE_ID)
        nodes_collection.insert_one.return_value = MagicMock()
        documents_collection.update_one.return_value = MagicMock()

        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_tree_response()
            tree_response = client.post(f"/generate-tree?document_id={doc_id}", headers=AUTH)

        assert tree_response.status_code == 200
        tree_data = tree_response.json()
        assert "tree_id" in tree_data
        assert tree_data["root"]["title"] == "Networking"

    def test_tree_leaf_nodes_are_unlocked(self, client):
        """Leaf nodes in the generated tree are not locked."""
        documents_collection.find_one.return_value = {
            "_id": ObjectId(self.DOC_ID),
            "extracted_text": "Networking notes.",
            "file_type": "docx",
            "name": "notes.docx",
        }
        trees_collection.insert_one.return_value.inserted_id = ObjectId(self.TREE_ID)
        nodes_collection.insert_one.return_value = MagicMock()
        documents_collection.update_one.return_value = MagicMock()

        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_tree_response()
            response = client.post(f"/generate-tree?document_id={self.DOC_ID}", headers=AUTH)

        root = response.json()["root"]
        for child in root["children"]:
            assert child["locked"] is False

    def test_create_session_then_fetch_unlock_status(self, client):
        """Creating a session then retrieving it returns consistent unlock status."""
        trees_collection.find_one.return_value = {
            "_id": ObjectId(self.TREE_ID),
            "root": TREE_HIERARCHY,
        }

        create_response = client.post(f"/session?tree_id={self.TREE_ID}", headers=AUTH)
        assert create_response.status_code == 200
        session_id = create_response.json()["session_id"]
        initial_status = create_response.json()["node_unlock_status"]

        sessions_collection.find_one.return_value = {
            "session_id": session_id,
            "tree_id": self.TREE_ID,
            "node_unlock_status": initial_status,
        }
        get_response = client.get(f"/session/{session_id}", headers=AUTH)

        assert get_response.status_code == 200
        assert get_response.json()["node_unlock_status"] == initial_status

    def test_fetch_questions_for_unlocked_node(self, client):
        """GET /api/questions returns questions for a leaf node."""
        nodes_collection.find_one.return_value = {
            "tree_id": self.TREE_ID,
            "node_path": self.LEAF_PATH,
            "questions": [QUESTION],
        }

        response = client.get(f"/api/questions/{self.TREE_ID}/Networking/TCPIP", headers=AUTH)

        assert response.status_code == 200
        questions = response.json()["questions"]
        assert len(questions) == 1
        assert questions[0]["question"] == QUESTION["question"]

    def test_questions_are_cached_on_second_fetch(self, client):
        """Cached questions are returned without calling OpenAI again."""
        nodes_collection.find_one.return_value = {
            "tree_id": self.TREE_ID,
            "node_path": self.LEAF_PATH,
            "questions": [QUESTION],
        }

        with patch("routes.generate_questions.OpenAI") as MockOpenAI:
            client.get(f"/api/questions/{self.TREE_ID}/Networking/TCPIP", headers=AUTH)
            client.get(f"/api/questions/{self.TREE_ID}/Networking/TCPIP", headers=AUTH)
            MockOpenAI.assert_not_called()

    def test_evaluate_then_node_beaten(self, client):
        """Submitting a full-marks answer marks the node beaten."""
        nodes_collection.find_one.return_value = {
            "tree_id": self.TREE_ID,
            "node_path": self.LEAF_PATH,
            "questions": [QUESTION],
        }
        sessions_collection.find_one.return_value = {
            "session_id": self.SESSION_ID,
            "tree_id": self.TREE_ID,
            "node_unlock_status": {
                self.ROOT_PATH:   "locked",
                self.LEAF_PATH:   "available",
                self.LEAF_PATH_2: "available",
            },
        }
        attempts_collection.find.return_value = [
            {"question_text": QUESTION["question"], "marks_received": 2, "marks_total": 2},
        ]

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_eval_response(
                [True, True], "Excellent."
            )
            response = client.post(
                "/evaluate",
                json={
                    "tree_id": self.TREE_ID,
                    "node_path": self.LEAF_PATH,
                    "question_text": QUESTION["question"],
                    "user_answer": "TCPIP is a suite of protocols used on the internet.",
                    "session_id": self.SESSION_ID,
                },
                headers=AUTH,
            )

        assert response.status_code == 200
        data = response.json()
        assert data["marks_received"] == 2
        assert data["marks_total"] == 2

    def test_full_workflow_parent_unlocks_after_all_children_beaten(self, client):
        """Beating the last sibling unlocks the parent node."""
        nodes_collection.find_one.return_value = {
            "tree_id": self.TREE_ID,
            "node_path": self.LEAF_PATH,
            "questions": [QUESTION],
        }
        sessions_collection.find_one.return_value = {
            "session_id": self.SESSION_ID,
            "tree_id": self.TREE_ID,
            "node_unlock_status": {
                self.ROOT_PATH:   "locked",
                self.LEAF_PATH:   "available",
                self.LEAF_PATH_2: "completed",
            },
        }
        attempts_collection.find.return_value = [
            {"question_text": QUESTION["question"], "marks_received": 2, "marks_total": 2},
        ]

        with patch("routes.evaluate.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_eval_response(
                [True, True], "Excellent."
            )
            client.post(
                "/evaluate",
                json={
                    "tree_id": self.TREE_ID,
                    "node_path": self.LEAF_PATH,
                    "question_text": QUESTION["question"],
                    "user_answer": "TCPIP is a suite of protocols.",
                    "session_id": self.SESSION_ID,
                },
                headers=AUTH,
            )

        sessions_collection.update_one.assert_called_once()
        update_call = sessions_collection.update_one.call_args
        updated_status = update_call[0][1]["$set"]["node_unlock_status"]
        assert updated_status[self.ROOT_PATH] == "available"

    def test_delete_session_cleans_up_everything(self, client):
        """Deleting a session removes the session, attempts, nodes, and tree."""
        sessions_collection.find_one.return_value = {
            "session_id": self.SESSION_ID,
            "tree_id": self.TREE_ID,
            "node_unlock_status": {},
        }

        response = client.delete(f"/session/{self.SESSION_ID}", headers=AUTH)

        assert response.json()["deleted"] is True
        sessions_collection.delete_one.assert_called_once()
        attempts_collection.delete_many.assert_called_once()
        nodes_collection.delete_many.assert_called_once()
        trees_collection.delete_one.assert_called_once()
