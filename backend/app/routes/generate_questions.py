from fastapi import APIRouter
from pydantic import BaseModel
from db import nodes_collection, trees_collection, documents_collection
from bson import ObjectId
from config import settings
from openai import OpenAI
import json


router = APIRouter()

question_list = ["Define the following term:", "Solve this equation:", "Compare and contrast these two things",
                 "Explain why this is true", "Explain the following topic like I'm 5 years old"]


@router.get("/api/questions/{tree_id}/{node_path:path}")
async def get_questions(tree_id: str, node_path: str):
    """Fetch questions for a specific node"""
    try:
        node = nodes_collection.find_one(
            {"tree_id": tree_id, "node_path": node_path},
            max_time_ms=5000
        )

        if node and node.get("questions"):
            return {"questions": node["questions"]}

        # Not generated yet — fetch document text and generate now
        tree = trees_collection.find_one({"_id": ObjectId(tree_id)})
        if not tree:
            return {"questions": []}
        document = documents_collection.find_one(
            {"_id": ObjectId(tree["document_id"])})
        if not document:
            return {"questions": []}
        result = await generate_questions_and_answers(tree_id, node_path, document["extracted_text"])

        return {"questions": result["questions"] if result else []}
    except Exception as e:
        print(f"[ERROR] Failed to fetch questions: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return {"questions": [], "error": str(e)}


async def generate_questions_and_answers(tree_id, node_path, text):
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        prompt = f"""You are an exam question writer for a student revision app. Generate 3 to 5 exam-style questions strictly about the topic: {node_path}

Use ONLY the following study notes as your source material:

{text[:7500]}

QUESTION RULES:
- Every question MUST be answerable using only the study notes above
- Questions must target the specific leaf topic in the node path, not parent topics
- Use a mix of question types chosen from this exact list: Definition, Cause and Effect, Application, Comparison, True/False
- Each question must have a "type" field set to exactly one value from that list.
- You may mix and match types, but have no more then two of each type per question.
- Do not have questions with misleading topic names, such as "Example Employee Table", as nobody knows what that is, and that that is not an actual learning topic.
- Do not write questions that force you to look at the source material, unless you provide required context in the question. For example, NEVER say a question like: "In the Employee table, what does the functional dependency A -> B mean in terms of how values of A relate to values of B?". 

MARK SCHEME RULES:
- Each key point MUST state a specific fact, mechanism, or named concept
- Each key point MUST be independently verifiable
- NEVER write a key point that only says something "impacts", "affects", or "influences" another thing without explaining HOW or WHAT the specific change is
- NEVER write a vague summary as a key point

BAD key point: "Impacts the design of security testing tools"
GOOD key point: "Security testing tools must include built-in permission checks to ensure testing is authorised before execution"

BAD key point: "Affects how data is stored"
GOOD key point: "Personal data must not be retained beyond the period necessary for its original purpose"

Each key point is worth exactly 1 mark. Generate 1-4 key points per question.

OUTPUT FORMAT — return this exact JSON structure, nothing else:
{{
  "questions": [
    {{
      "type": "Application",
      "question": "State two ways the Computer Misuse Act 1990 constrains the functionality of penetration testing tools.",
      "answer": [
        "Tools must require explicit authorisation from the system owner before initiating any scan or test",
        "Tools must limit their scope to systems and IP ranges specified in the authorisation to avoid unauthorised access"
      ]
    }}
  ]
}}

HARD CONSTRAINTS:
- Return ONLY valid JSON — no markdown, no explanation, no preamble
- Do NOT include a forward slash anywhere in questions or answers
- Do NOT invent facts not present in the study notes"""

        response = client.responses.create(
            model="gpt-5.4-nano",
            input=prompt
        )

        json_formatted_reply = json.loads(response.output_text)
        print(f"Generated questions for {node_path}: {json_formatted_reply}")
        add_to_db(tree_id, node_path, json_formatted_reply["questions"])
        return json_formatted_reply
    except Exception as e:
        print(
            f"ERROR generating questions for {node_path}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None


class GenerateNewRequest(BaseModel):
    existing_questions: list[str] = []


@router.post("/api/questions/{tree_id}/{node_path:path}/generate-new")
async def generate_new_question(tree_id: str, node_path: str, body: GenerateNewRequest = GenerateNewRequest()):
    """Generate a single fresh question, avoiding the questions passed in the request body."""
    try:
        tree = trees_collection.find_one({"_id": ObjectId(tree_id)})
        if not tree:
            return {"error": "Tree not found"}
        document = documents_collection.find_one({"_id": ObjectId(tree["document_id"])})
        if not document:
            return {"error": "Document not found"}

        question = await _generate_single_question(node_path, document["extracted_text"], body.existing_questions)
        if not question:
            return {"error": "Failed to generate question"}
        return {"question": question}
    except Exception as e:
        print(f"ERROR generating new question for {node_path}: {type(e).__name__}: {e}")
        return {"error": str(e)}


async def _generate_single_question(node_path: str, text: str, existing_questions: list[str]) -> dict | None:
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        avoid_block = ""
        if existing_questions:
            formatted = "\n".join(f"- {q}" for q in existing_questions)
            avoid_block = f"\nDo NOT generate any of these already-used questions:\n{formatted}\n"

        prompt = f"""You are an exam question writer for a student revision app. Generate exactly ONE new exam-style question strictly about the topic: {node_path}

Use ONLY the following study notes as your source material:

{text[:7500]}
{avoid_block}
QUESTION RULES:
- The question MUST be answerable using only the study notes above
- Target the specific leaf topic in the node path, not parent topics
- Choose a type from: Definition, Cause and Effect, Application, Comparison, True/False
- The question must have a "type" field set to exactly one value from that list

MARK SCHEME RULES:
- Each key point MUST state a specific fact, mechanism, or named concept
- Each key point MUST be independently verifiable
- NEVER write a vague or impact-only key point without explaining HOW or WHAT
- Generate 1-4 key points worth 1 mark each

OUTPUT FORMAT — return this exact JSON structure, nothing else:
{{
  "questions": [
    {{
      "type": "Definition",
      "question": "Your question here.",
      "answer": ["Key point one", "Key point two"]
    }}
  ]
}}

HARD CONSTRAINTS:
- Return ONLY valid JSON — no markdown, no explanation, no preamble
- Do NOT include a forward slash anywhere in questions or answers
- Do NOT invent facts not present in the study notes"""

        response = client.responses.create(model="gpt-5.4-nano", input=prompt)
        parsed = json.loads(response.output_text)
        return parsed["questions"][0]
    except Exception as e:
        print(f"ERROR in _generate_single_question: {type(e).__name__}: {e}")
        return None


def add_to_db(tree_id, node_path, questions):
    result = nodes_collection.update_one(
        {"tree_id": tree_id, "node_path": node_path},
        {"$set": {"questions": questions}}
    )
    if result.matched_count == 0:
        print(f"WARNING: Node not found for {node_path}")
