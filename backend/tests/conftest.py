"""
Shared test infrastructure.

The db module is replaced with persistent MagicMock collections BEFORE
the FastAPI app is imported, so every route module binds to these mocks
at import time.  Tests configure return values on these objects directly
and call reset_mock() via the autouse fixture between tests.
"""
import sys
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Persistent mock collections — imported by route modules at startup
# ---------------------------------------------------------------------------
documents_collection = MagicMock(name="documents_collection")
trees_collection     = MagicMock(name="trees_collection")
nodes_collection     = MagicMock(name="nodes_collection")
sessions_collection  = MagicMock(name="sessions_collection")
attempts_collection  = MagicMock(name="attempts_collection")

if "db" not in sys.modules:
    sys.modules["db"] = MagicMock(
        documents_collection=documents_collection,
        trees_collection=trees_collection,
        nodes_collection=nodes_collection,
        sessions_collection=sessions_collection,
        attempts_collection=attempts_collection,
    )

# Import app AFTER db mock is in place.
from main import app  # noqa: E402
from dependencies import VALID_TOKEN  # noqa: E402

AUTH = {"Authorization": f"Bearer {VALID_TOKEN}"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_mocks():
    """Reset every mock collection before each test."""
    for col in (
        documents_collection,
        trees_collection,
        nodes_collection,
        sessions_collection,
        attempts_collection,
    ):
        col.reset_mock()
    yield
