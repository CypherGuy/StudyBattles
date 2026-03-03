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
    
    # Store in MongoDB
    tree = {
        "document_id": document_id,
        "root": hierachy
    }

    result = trees_collection.insert_one(tree)
    return {"tree_id": str(result.inserted_id), "root": tree["root"]}








def generate_hierarchy_from_text(text: str, max_depth: int = 3, max_children: int = 4):
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = f"""
    Given the study material, and only the following study notes/materials:
    
    {text[:2500]} 
    
    Generate a topic hierarchy in JSON format where:
    - The root is the overarching topic
    - Each node has prerequisite children
    - Max depth: {max_depth}
    - Max children per node: {max_children}
    
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
    
    return response.output_text