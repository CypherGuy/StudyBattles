from fastapi import APIRouter
from db import documents_collection, trees_collection
from config import settings
from openai import OpenAI
import json
from bson import ObjectId


router = APIRouter()


@router.post("/generate-tree")
async def generate_tree(document_id: str):
    document = documents_collection.find_one({"_id": ObjectId(document_id)})
    document_text = document["extracted_text"]
    document_type = document["file_type"]
    document_name = document["name"]

    hierachy = generate_hierarchy_from_text(document_text)
    valid, msg = validate_tree(hierachy)
    if not valid:
        raise ValueError(msg)

    # Store in MongoDB
    tree = {
        "document_id": document_id,
        "document_name": document_name,
        "document_type": document_type,
        "root": hierachy
    }

    result = trees_collection.insert_one(tree)
    return {"tree_id": str(result.inserted_id), "root": tree["root"]}


def validate_tree(node, depth=0, max_depth=4, max_children=4):
    if not node.get("title"):
        return False, "Node doesn't have a title"

    if depth > max_depth:
        return False, f"Tree exceeds max depth of {max_depth}"

    children = node.get("children", [])
    if len(children) > max_children:
        return False, f"Node has {len(children)} children, max is {max_children}"

    for child in children:
        valid, msg = validate_tree(child, depth + 1, max_depth, max_children)
        if not valid:
            return valid, msg

    return True, "Valid"


def generate_hierarchy_from_text(text: str, max_depth: int = 4, max_children: int = 4):
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = f"""
    Given the study material, and only the following study notes/materials:
    
    {text[:2500]} 
    
    Generate a topic hierarchy in JSON format where:
    - The root is the overarching topic
    - Each node has prerequisite children
    - Max depth: {max_depth}
    - Max children per node: {max_children}

    There is no need to fill in every available space to add a topic if you don't need to.
    
    Here is an example of the JSON that you need to output. Keep the exact same keys, only change the values. Note how I implement recursion of the children array indicating child nodes and leaf nodes:
    {{
    "title": "Calculus",
    "children": [
        {{
        "title": "Differentiation",
        "locked": true,
        "children": [
            {{
            "title": "Limits",
            "locked": false,
            "children": []
            }},
            {{
            "title": "Rate of Change",
            "locked": false,
            "children": []
            }}
        ]
        }},
        {{
        "title": "Integration",
        "locked": true,
        "children": [
            {{
            "title": "Antiderivatives",
            "locked": false,
            "children": []
            }},
            {{
            "title": "Fundamental Theorem",
            "locked": false,
            "children": []
            }}
        ]
        }}
    ]
    }}

    Do not add any other text, only output JSON without rambling. Do not exceed max_depth of {max_depth}. Do not give any node more than {max_children} children.

    Return ONLY valid, parseable JSON with no additional text, explanation, or markdown formatting. 
    """

    response = client.responses.create(
        model="gpt-5-mini-2025-08-07",
        input=prompt
    )

    json_formatted_reply = json.loads(response.output_text)
    return json_formatted_reply
