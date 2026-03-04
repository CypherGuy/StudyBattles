from fastapi import APIRouter
from db import nodes_collection
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

        if node and "questions" in node:
            return {"questions": node["questions"]}

        return {"questions": []}
    except Exception as e:
        print(f"[ERROR] Failed to fetch questions: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return {"questions": [], "error": str(e)}


async def generate_questions_and_answers(tree_id, node_path, text):
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        prompt = f"""
    Given the study material, and only the following study notes/materials:

    {text[:3000]}

    Come up with 3 to 5 questions based on the following node path: {node_path}. You only want to ask questions that revolve around this topic.

    For example if the path is "AI & Machine Learning Pipelines/Data Sources/Infrastructural Data/Cloud Resource Metrics"

    You only want to ask questions about Cloud Resource Metrics, only using information found in the study notes.

    You may use the following to help come up with acceptable question types:
    - {question_list[0]}
    - {question_list[1]}
    - {question_list[2]}
    - {question_list[3]}
    - {question_list[4]}

    For each question, we need an answer. Generate 1-4 small but relevant key points for what the perfect answer should contain, only taking information from the study notes. Each element in the list should be worth exactly one (1) mark.
    This means if you want a 2 mark question, you should generate 2 answers.

    Your output must be in the following JSON format. Continuing with the Cloud Resource Metrics example above, here's an example output:
    {{
        "questions": [
        {{
            "question": "What are cloud resource metrics and why are they important for monitoring infrastructure?",
        "answer": ["Cloud resource metrics track usage and performance", "They help identify bottlenecks or inefficiencies", "They enable cost optimization and capacity planning"]
        }},
        {{
            "question": "Name three examples of cloud resource metrics you would collect from your infrastructure.",
        "answer": ["CPU utilization", "Memory usage", "Network throughput or disk I/O"]
        }},
        {{
            "question": "Explain how cloud resource metrics differ from application-level metrics.",
        "answer": ["Cloud metrics focus on infrastructure performance", "Application metrics focus on business logic and user experience", "Cloud metrics are infrastructure-specific while application metrics are domain-specific"]
        }},
        {{
            "question": "What would you do if cloud resource metrics show consistently high CPU usage?",
        "answer": ["Investigate the root cause of high CPU demand", "Scale resources vertically or horizontally"]
        }}
    ]
    }}

    Do not at any point include a slash (/) in your output, be it question or answer. Do not go off topic, only output JSON without rambling. Return ONLY valid, parseable JSON with no additional text, explanation, or markdown formatting.
    """

        response = client.responses.create(
            model="gpt-5-mini-2025-08-07",
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


def add_to_db(tree_id, node_path, questions):
    result = nodes_collection.update_one(
        {"tree_id": tree_id, "node_path": node_path},
        {"$set": {"questions": questions}}
    )
    if result.matched_count == 0:
        print(f"WARNING: Node not found for {node_path}")
