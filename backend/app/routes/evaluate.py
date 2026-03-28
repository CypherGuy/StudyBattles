import json

from fastapi import APIRouter
from session import store_attempt_and_check_unlock
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

    prompt = f"""You are marking an exam answer against a mark scheme. Award marks for demonstrating correct understanding of concepts.

CORE PRINCIPLES:
1. Award marks when the student demonstrates they understand the CONCEPT, even if:
   - They use informal language instead of technical terms
   - They paraphrase rather than use exact wording
   - They describe the idea in their own words

2. DO NOT award marks when:
   - The concept is fundamentally wrong or confused with something else
   - They mention related but incorrect ideas
   - The answer is empty or irrelevant
   - They use buzzwords without demonstrating understanding

3. TERMINOLOGY FLEXIBILITY:
   - If a student describes what something does correctly, award the mark even if they don't name it
   - Accept synonyms and reasonable paraphrases
   - Focus on whether they GET IT, not whether they memorized exact wording

4. BE STRICT ON:
   - Factual errors (wrong numbers, wrong outcomes, wrong relationships)
   - Concept confusion (mixing up two different ideas)
   - Missing the point entirely

Student answer: "{request.user_answer}"

Mark scheme points:
{json.dumps(key_points, indent=2)}

For each mark scheme point, ask yourself: "Does the student demonstrate they understand this concept?"
If yes → true. If no or unclear → false.

Respond with ONLY a JSON object with two keys:
- "results": array of booleans (true/false), one per mark scheme point
- "feedback": one sentence explaining what the student got right and what they should include next time

No markdown, no extra text."""

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
