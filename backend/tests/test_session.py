import pytest
from tests.conftest import (
    trees_collection,
    sessions_collection,
    attempts_collection,
    nodes_collection,
)

TREE_ID   = "507f1f77bcf86cd799439011"
SESSION_ID = "session-abc-123"

SIMPLE_TREE = {
    "_id": TREE_ID,
    "root": {
        "title": "Computer Science",
        "children": [
            {"title": "Networks", "children": []},
            {"title": "Databases", "children": []},
        ],
    },
}

LEAF_PATH_1 = "Computer Science/Networks"
LEAF_PATH_2 = "Computer Science/Databases"
ROOT_PATH   = "Computer Science"

STORED_SESSION = {
    "session_id": SESSION_ID,
    "tree_id": TREE_ID,
    "node_unlock_status": {
        ROOT_PATH:   "locked",
        LEAF_PATH_1: "available",
        LEAF_PATH_2: "available",
    },
}


class TestCreateSession:
    def test_create_session_returns_session_id(self, client):
        trees_collection.find_one.return_value = SIMPLE_TREE

        response = client.post(f"/session?tree_id={TREE_ID}")

        assert response.status_code == 200
        assert "session_id" in response.json()

    def test_create_session_returns_node_unlock_status(self, client):
        trees_collection.find_one.return_value = SIMPLE_TREE

        response = client.post(f"/session?tree_id={TREE_ID}")

        data = response.json()
        assert "node_unlock_status" in data
        assert isinstance(data["node_unlock_status"], dict)

    def test_leaf_nodes_are_available_on_creation(self, client):
        trees_collection.find_one.return_value = SIMPLE_TREE

        response = client.post(f"/session?tree_id={TREE_ID}")

        status = response.json()["node_unlock_status"]
        assert status[LEAF_PATH_1] == "available"
        assert status[LEAF_PATH_2] == "available"

    def test_parent_nodes_are_locked_on_creation(self, client):
        trees_collection.find_one.return_value = SIMPLE_TREE

        response = client.post(f"/session?tree_id={TREE_ID}")

        status = response.json()["node_unlock_status"]
        assert status[ROOT_PATH] == "locked"

    def test_session_is_persisted_to_db(self, client):
        trees_collection.find_one.return_value = SIMPLE_TREE

        client.post(f"/session?tree_id={TREE_ID}")

        sessions_collection.insert_one.assert_called_once()
        saved = sessions_collection.insert_one.call_args[0][0]
        assert saved["tree_id"] == TREE_ID
        assert "session_id" in saved


class TestGetSession:
    def test_get_session_returns_stored_status(self, client):
        sessions_collection.find_one.return_value = STORED_SESSION

        response = client.get(f"/session/{SESSION_ID}")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == SESSION_ID
        assert data["node_unlock_status"][LEAF_PATH_1] == "available"

    def test_get_nonexistent_session_returns_empty_status(self, client):
        sessions_collection.find_one.return_value = None

        response = client.get("/session/does-not-exist")

        assert response.status_code == 200
        assert response.json()["node_unlock_status"] == {}


class TestDeleteSession:
    def test_delete_session_returns_deleted_true(self, client):
        sessions_collection.find_one.return_value = STORED_SESSION

        response = client.delete(f"/session/{SESSION_ID}")

        assert response.status_code == 200
        assert response.json()["deleted"] is True

    def test_delete_session_removes_session_from_db(self, client):
        sessions_collection.find_one.return_value = STORED_SESSION

        client.delete(f"/session/{SESSION_ID}")

        sessions_collection.delete_one.assert_called_once_with({"session_id": SESSION_ID})

    def test_delete_session_removes_associated_attempts(self, client):
        sessions_collection.find_one.return_value = STORED_SESSION

        client.delete(f"/session/{SESSION_ID}")

        attempts_collection.delete_many.assert_called_once_with({"session_id": SESSION_ID})

    def test_delete_nonexistent_session_still_returns_deleted_true(self, client):
        sessions_collection.find_one.return_value = None

        response = client.delete(f"/session/ghost")

        assert response.status_code == 200
        assert response.json()["deleted"] is True


class TestCompletedQuestions:
    def test_returns_questions_answered_with_full_marks(self, client):
        attempts_collection.find.return_value = [
            {"question_text": "What is SQL?", "marks_received": 2, "marks_total": 2},
            {"question_text": "What is XSS?", "marks_received": 1, "marks_total": 2},
        ]

        response = client.get(
            f"/session/{SESSION_ID}/completed-questions",
            params={"node_path": LEAF_PATH_1},

        )

        assert response.status_code == 200
        completed = response.json()["completed_questions"]
        assert "What is SQL?" in completed
        assert "What is XSS?" not in completed

    def test_returns_empty_list_when_no_full_marks_attempts(self, client):
        attempts_collection.find.return_value = [
            {"question_text": "What is SQL?", "marks_received": 0, "marks_total": 2},
        ]

        response = client.get(
            f"/session/{SESSION_ID}/completed-questions",
            params={"node_path": LEAF_PATH_1},

        )

        assert response.json()["completed_questions"] == []

    def test_deduplicates_repeated_full_marks_attempts(self, client):
        attempts_collection.find.return_value = [
            {"question_text": "What is SQL?", "marks_received": 2, "marks_total": 2},
            {"question_text": "What is SQL?", "marks_received": 2, "marks_total": 2},
        ]

        response = client.get(
            f"/session/{SESSION_ID}/completed-questions",
            params={"node_path": LEAF_PATH_1},

        )

        completed = response.json()["completed_questions"]
        assert completed.count("What is SQL?") == 1


class TestRecordAttempt:
    def _setup(self):
        sessions_collection.find_one.return_value = STORED_SESSION.copy()
        nodes_collection.find_one.return_value = {
            "tree_id": TREE_ID,
            "node_path": LEAF_PATH_1,
            "questions": [{"question": "Define a network.", "answer": ["A collection of connected devices"]}],
        }
        attempts_collection.find.return_value = []

    def test_attempt_is_stored_in_db(self, client):
        self._setup()

        client.post(
            f"/session/{SESSION_ID}/attempt",
            json={
                "tree_id": TREE_ID,
                "node_path": LEAF_PATH_1,
                "question_text": "Define a network.",
                "user_answer": "Devices connected together.",
                "marks_received": 0,
                "marks_total": 1,
            },

        )

        attempts_collection.insert_one.assert_called_once()

    def test_node_not_beaten_when_answer_wrong(self, client):
        self._setup()
        attempts_collection.find.return_value = [
            {"question_text": "Define a network.", "marks_received": 0, "marks_total": 1},
        ]

        response = client.post(
            f"/session/{SESSION_ID}/attempt",
            json={
                "tree_id": TREE_ID,
                "node_path": LEAF_PATH_1,
                "question_text": "Define a network.",
                "user_answer": "I have no idea.",
                "marks_received": 0,
                "marks_total": 1,
            },

        )

        assert response.json()["node_beaten"] is False

    def test_node_beaten_when_all_questions_answered_with_full_marks(self, client):
        sessions_collection.find_one.return_value = STORED_SESSION.copy()
        nodes_collection.find_one.return_value = {
            "tree_id": TREE_ID,
            "node_path": LEAF_PATH_1,
            "questions": [{"question": "Define a network.", "answer": ["A collection of connected devices"]}],
        }
        attempts_collection.find.return_value = [
            {"question_text": "Define a network.", "marks_received": 1, "marks_total": 1},
        ]

        response = client.post(
            f"/session/{SESSION_ID}/attempt",
            json={
                "tree_id": TREE_ID,
                "node_path": LEAF_PATH_1,
                "question_text": "Define a network.",
                "user_answer": "A collection of connected devices.",
                "marks_received": 1,
                "marks_total": 1,
            },

        )

        assert response.json()["node_beaten"] is True

    def test_beating_a_node_marks_it_completed_in_unlock_status(self, client):
        sessions_collection.find_one.return_value = STORED_SESSION.copy()
        nodes_collection.find_one.return_value = {
            "tree_id": TREE_ID,
            "node_path": LEAF_PATH_1,
            "questions": [{"question": "Define a network.", "answer": ["Connected devices"]}],
        }
        attempts_collection.find.return_value = [
            {"question_text": "Define a network.", "marks_received": 1, "marks_total": 1},
        ]

        response = client.post(
            f"/session/{SESSION_ID}/attempt",
            json={
                "tree_id": TREE_ID,
                "node_path": LEAF_PATH_1,
                "question_text": "Define a network.",
                "user_answer": "Connected devices.",
                "marks_received": 1,
                "marks_total": 1,
            },

        )

        status = response.json()["node_unlock_status"]
        assert status[LEAF_PATH_1] == "completed"

    def test_parent_unlocked_when_all_siblings_completed(self, client):
        status_before = {
            ROOT_PATH:   "locked",
            LEAF_PATH_1: "available",
            LEAF_PATH_2: "completed",
        }
        sessions_collection.find_one.return_value = {
            "session_id": SESSION_ID,
            "tree_id": TREE_ID,
            "node_unlock_status": status_before,
        }
        nodes_collection.find_one.return_value = {
            "tree_id": TREE_ID,
            "node_path": LEAF_PATH_1,
            "questions": [{"question": "Define a network.", "answer": ["Connected devices"]}],
        }
        attempts_collection.find.return_value = [
            {"question_text": "Define a network.", "marks_received": 1, "marks_total": 1},
        ]

        response = client.post(
            f"/session/{SESSION_ID}/attempt",
            json={
                "tree_id": TREE_ID,
                "node_path": LEAF_PATH_1,
                "question_text": "Define a network.",
                "user_answer": "Connected devices.",
                "marks_received": 1,
                "marks_total": 1,
            },

        )

        status = response.json()["node_unlock_status"]
        assert status[ROOT_PATH] == "available"
