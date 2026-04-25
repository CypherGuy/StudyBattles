import copy
import json
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId

from tests.conftest import AUTH, documents_collection, trees_collection, nodes_collection
from routes.generate_tree import validate_tree, set_locked_status, extract_all_node_paths

DOC_ID  = "507f1f77bcf86cd799439011"
TREE_ID = "507f1f77bcf86cd799439099"

FLAT_HIERARCHY = {
    "title": "Security",
    "children": [
        {"title": "SQL Injection", "children": []},
        {"title": "XSS",          "children": []},
    ],
}

STORED_DOCUMENT = {
    "_id": ObjectId(DOC_ID),
    "extracted_text": "Web security notes.",
    "file_type": "docx",
    "name": "security.docx",
}


def _openai_response(tree: dict) -> MagicMock:
    m = MagicMock()
    m.output_text = json.dumps(tree)
    return m


def _fresh_hierarchy():
    return copy.deepcopy(FLAT_HIERARCHY)


class TestGenerateTreeEndpoint:
    def _setup(self):
        documents_collection.find_one.return_value = copy.deepcopy(STORED_DOCUMENT)
        trees_collection.insert_one.return_value.inserted_id = ObjectId(TREE_ID)
        nodes_collection.insert_one.return_value = MagicMock()
        documents_collection.update_one.return_value = MagicMock()

    def test_returns_tree_with_correct_root_title(self, client):
        self._setup()
        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(_fresh_hierarchy())
            response = client.post(f"/generate-tree?document_id={DOC_ID}", headers=AUTH)
        assert response.status_code == 200
        assert response.json()["root"]["title"] == "Security"

    def test_response_includes_tree_id(self, client):
        self._setup()
        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(_fresh_hierarchy())
            response = client.post(f"/generate-tree?document_id={DOC_ID}", headers=AUTH)
        assert "tree_id" in response.json()

    def test_node_document_inserted_for_every_path(self, client):
        self._setup()
        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(_fresh_hierarchy())
            client.post(f"/generate-tree?document_id={DOC_ID}", headers=AUTH)
        # root + 2 leaf children = 3 nodes
        assert nodes_collection.insert_one.call_count == 3

    def test_document_updated_with_tree_id(self, client):
        self._setup()
        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            MockOpenAI.return_value.responses.create.return_value = _openai_response(_fresh_hierarchy())
            client.post(f"/generate-tree?document_id={DOC_ID}", headers=AUTH)
        documents_collection.update_one.assert_called_once()
        update_args = documents_collection.update_one.call_args[0]
        assert "tree_id" in update_args[1]["$set"]

    def test_existing_tree_returned_without_calling_openai(self, client):
        doc_with_tree = {**copy.deepcopy(STORED_DOCUMENT), "tree_id": TREE_ID}
        documents_collection.find_one.return_value = doc_with_tree
        trees_collection.find_one.return_value = {
            "_id": ObjectId(TREE_ID),
            "root": _fresh_hierarchy(),
        }

        with patch("routes.generate_tree.OpenAI") as MockOpenAI:
            response = client.post(f"/generate-tree?document_id={DOC_ID}", headers=AUTH)
            MockOpenAI.assert_not_called()

        assert response.status_code == 200
        assert response.json()["root"]["title"] == "Security"

    def test_requires_auth(self, client):
        response = client.post(f"/generate-tree?document_id={DOC_ID}")
        assert response.status_code in (401, 422)


class TestValidateTree:
    def test_valid_flat_tree_passes(self):
        valid, _ = validate_tree(_fresh_hierarchy())
        assert valid is True

    def test_tree_at_max_depth_passes(self):
        # depth 0 → 1 → 2 → 3: exactly 4 levels, should be valid
        at_limit = {
            "title": "L0", "children": [
                {"title": "L1", "children": [
                    {"title": "L2", "children": [
                        {"title": "L3", "children": []}
                    ]}
                ]}
            ]
        }
        valid, _ = validate_tree(at_limit)
        assert valid is True

    def test_tree_exceeding_max_depth_is_rejected(self):
        too_deep = {
            "title": "L0", "children": [
                {"title": "L1", "children": [
                    {"title": "L2", "children": [
                        {"title": "L3", "children": [
                            {"title": "L4", "children": []}
                        ]}
                    ]}
                ]}
            ]
        }
        valid, msg = validate_tree(too_deep)
        assert valid is False
        assert "depth" in msg.lower()

    def test_node_with_too_many_children_is_rejected(self):
        too_wide = {
            "title": "Root",
            "children": [{"title": f"Child{i}", "children": []} for i in range(5)],
        }
        valid, msg = validate_tree(too_wide)
        assert valid is False
        assert "children" in msg.lower()

    def test_node_without_title_is_rejected(self):
        no_title = {"children": []}
        valid, _ = validate_tree(no_title)
        assert valid is False

    def test_deeply_nested_too_many_children_is_rejected(self):
        # Too many children at depth 2, not at root
        deep_wide = {
            "title": "Root", "children": [
                {
                    "title": "Mid",
                    "children": [{"title": f"Leaf{i}", "children": []} for i in range(5)],
                }
            ]
        }
        valid, _ = validate_tree(deep_wide)
        assert valid is False


class TestSetLockedStatus:
    def test_leaf_node_has_locked_false(self):
        leaf = {"title": "Leaf", "children": []}
        set_locked_status(leaf)
        assert leaf["locked"] is False

    def test_parent_node_has_locked_true(self):
        parent = {"title": "Parent", "children": [{"title": "Leaf", "children": []}]}
        set_locked_status(parent)
        assert parent["locked"] is True

    def test_locked_status_set_recursively(self):
        tree = {
            "title": "Root", "children": [
                {"title": "Mid", "children": [
                    {"title": "Leaf", "children": []}
                ]}
            ]
        }
        set_locked_status(tree)
        assert tree["locked"] is True
        assert tree["children"][0]["locked"] is True
        assert tree["children"][0]["children"][0]["locked"] is False


class TestExtractAllNodePaths:
    def test_extracts_root_path(self):
        paths = extract_all_node_paths({"title": "Root", "children": []})
        assert "Root" in paths

    def test_extracts_child_paths(self):
        paths = extract_all_node_paths(_fresh_hierarchy())
        assert "Security/SQL Injection" in paths
        assert "Security/XSS" in paths

    def test_path_count_matches_node_count(self):
        paths = extract_all_node_paths(_fresh_hierarchy())
        # root + 2 children
        assert len(paths) == 3
