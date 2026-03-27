from fastapi import APIRouter
from pydantic import BaseModel
from db import nodes_collection


router = APIRouter()


class EvaluateRequest(BaseModel):
    tree_id: str
    node_path: str
    question_text: str
    user_answer: str


@router.post("/evaluate")
async def evaluate(request: EvaluateRequest):
    node = nodes_collection.find_one({"tree_id": request.tree_id, "node_path": request.node_path})

    question = next((q for q in node["questions"] if q["question"] == request.question_text), None)
    if not question:
        return {"error": "Question not found"}

    key_points = question["answer"]
    user_answer_lower = request.user_answer.lower()

    # Check if each key point appears in the user's answer
    key_points_hit = [point for point in key_points if point.lower() in user_answer_lower]

    marks_received = len(key_points_hit)
    marks_total = len(key_points)

    return {
        "marks_received": marks_received,
        "marks_total": marks_total,
        "key_points_hit": key_points_hit
    }
