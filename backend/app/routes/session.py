from fastapi import APIRouter
from db import trees_collection, sessions_collection
from .generate_tree import add_paths_to_tree, extract_locked_status
from uuid import uuid4
from bson import ObjectId


router = APIRouter()


@router.post("/session")
async def create_session(tree_id: str):
    # The point of this is to track which nodes are locked and unlocked

    tree = trees_collection.find_one({"_id": ObjectId(tree_id)})
    root = tree["root"]
    # extract_locked_status requires the path, which may not always be in there. To be sure we run this first
    add_paths_to_tree(root)

    node_unlock_status = extract_locked_status(root)

    # Once we have the root we can make a session and add to db

    session_id = str(uuid4())
    sessions_collection.insert_one({
        "tree_id": tree_id,
        "session_id": session_id,
        "node_unlock_status": node_unlock_status
    })

    return {"session_id": session_id, "node_unlock_status": node_unlock_status}


@router.get("/session/{session_id}")
async def get_progress_and_unlock_status(session_id):
    session = sessions_collection.find_one(
        {"session_id": session_id})
    node_unlock_status = session["node_unlock_status"]
    return {"session_id": session_id, "node_unlock_status": node_unlock_status}
