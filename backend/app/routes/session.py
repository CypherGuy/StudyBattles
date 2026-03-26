from fastapi import APIRouter
from db import trees_collection, nodes_collection, sessions_collection, attempts_collection
from .generate_tree import add_paths_to_tree, extract_locked_status
from models.attempt import AttemptRequest
from uuid import uuid4
from bson import ObjectId
from datetime import datetime, timezone


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


@router.post("/session/{session_id}/attempt")
async def store_attempt_and_check_unlock(session_id: str, attempt: AttemptRequest):
    # Store the attempt
    attempts_collection.insert_one({
        "tree_id": attempt.tree_id,
        "session_id": session_id,
        "node_path": attempt.node_path,
        "question_text": attempt.question_text,
        "user_answer": attempt.user_answer,
        "marks_received": attempt.marks_received,
        "marks_total": attempt.marks_total,
        "attempted_at": datetime.now(timezone.utc)
    })

    # Check if the node is beaten (full marks on all questions)
    node = nodes_collection.find_one(
        {"tree_id": attempt.tree_id, "node_path": attempt.node_path})
    all_questions = [q["question"] for q in node["questions"]]

    node_beaten = all(
        attempts_collection.find_one({
            "session_id": session_id,
            "node_path": attempt.node_path,
            "question_text": q,
            "marks_received": {"$eq": {"$fieldRef": "marks_total"}}
        }) is not None
        for q in all_questions
    )

    # If beaten, unlock this node and check if parent should be unlocked too
    session = sessions_collection.find_one({"session_id": session_id})
    node_unlock_status = session["node_unlock_status"]

    if node_beaten:
        node_unlock_status[attempt.node_path] = False  # False = unlocked

        # Check if all siblings are beaten — if so, find then unlock the parent
        parent_path = "/".join(attempt.node_path.split("/")[:-1])
        if parent_path:
            siblings = [
                path for path in node_unlock_status if "/".join(path.split("/")[:-1]) == parent_path]
            if all(not node_unlock_status[s] for s in siblings):
                node_unlock_status[parent_path] = False

        sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {"node_unlock_status": node_unlock_status}}
        )

    return {"node_beaten": node_beaten, "node_unlock_status": node_unlock_status}
