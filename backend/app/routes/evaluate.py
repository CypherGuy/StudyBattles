import json

from fastapi import APIRouter
from .session import store_attempt_and_check_unlock
from models.attempt import AttemptRequest
from pydantic import BaseModel
from openai import OpenAI
from db import nodes_collection
from config import settings


router = APIRouter()


class EvaluateRequest(BaseModel):
    tree_id: str
    node_path: str
    question_text: str
    user_answer: str
    session_id: str


@router.post("/evaluate")
async def evaluate(request: EvaluateRequest):
    node = nodes_collection.find_one(
        {"tree_id": request.tree_id, "node_path": request.node_path})

    question = next(
        (q for q in node["questions"] if q["question"] == request.question_text), None)
    if not question:
        return {"error": "Question not found"}

    key_points = question["answer"]

    prompt = f"""You are a strict but encouraging exam marker. Your job is to decide whether each mark scheme point is demonstrated in the student's answer, then give one sentence of feedback.

AWARD the mark when the student shows they understand the concept — accept paraphrasing, synonyms, and informal language as long as the underlying idea is correct.

WITHHOLD the mark when: the concept is factually wrong, confused with another idea, or entirely absent. Buzzwords without demonstrated understanding do not count.

FEEDBACK RULES:
- Write directly to the student using "you" (never "the student")
- Never say things like "According to the study", just say the question
- One sentence only: acknowledge what they got right (if anything), then state exactly what to add to improve their score
- Never say they showed "no understanding" — just state what they need to include next time

Student answer: "{request.user_answer}"

Mark scheme points:
{json.dumps(key_points, indent=2)}

Respond with ONLY valid JSON — no markdown, no extra text:
{{"results": [true/false per mark scheme point], "feedback": "one sentence"}}"""

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.responses.create(
        model="gpt-5-mini-2025-08-07",
        input=prompt
    )

    parsed = json.loads(response.output_text)
    results = parsed["results"]
    feedback = parsed["feedback"]
    key_points_hit = [point for point, hit in zip(key_points, results) if hit]

    await store_attempt_and_check_unlock(session_id=request.session_id, attempt=AttemptRequest(
        tree_id=request.tree_id,
        node_path=request.node_path,
        question_text=request.question_text,
        user_answer=request.user_answer,
        marks_received=len(key_points_hit),
        marks_total=len(key_points),
    ))

    return {
        "marks_received": len(key_points_hit),
        "marks_total": len(key_points),
        "key_points_hit": key_points_hit,
        "feedback": feedback
    }
