from fastapi import APIRouter
from .generate_questions import generate_questions_and_answers

from db import documents_collection, trees_collection, nodes_collection, sessions_collection
from config import settings
from openai import OpenAI
import json
from bson import ObjectId
import asyncio


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
    tree_id = str(result.inserted_id)

    documents_collection.update_one({"_id": ObjectId(document_id)}, {
                                    "$set": {"tree_id": tree_id}})

    node_paths = extract_all_node_paths(hierachy)
    for node_path in node_paths:
        node_doc = {
            "tree_id": tree_id,
            "node_path": node_path,
            "questions": []
        }
        nodes_collection.insert_one(node_doc)

    add_paths_to_tree(hierachy)
    extract_locked_status(hierachy)

    # Generate questions in the background
    asyncio.create_task(generate_questions_background(
        tree_id, node_paths, document_text))

    return {"tree_id": tree_id, "root": hierachy}


async def generate_questions_background(tree_id, node_paths, document_text):
    tasks = [
        generate_questions_and_answers(tree_id, node_path, document_text)
        for node_path in node_paths
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    completed = sum(1 for r in results if r is not None)
    failed = len(results) - completed

    if failed > 0:
        print(f"Failed to generate questions for {failed} nodes")


def add_paths_to_tree(node, current_path=""):
    if current_path:
        node['path'] = f"{current_path}/{node['title']}"
    else:
        node['path'] = node['title']

    if 'children' in node and node['children']:
        for child in node['children']:
            add_paths_to_tree(child, node['path'])


def extract_locked_status(node):
    ret = {}
    ret[node['path']] = node['locked']
    if not node['children'] or len(node['children']) == 0:
        ret[node['path']] = False
    else:
        for child in node['children']:
            ret.update(extract_locked_status(child))
    return ret


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


def extract_all_node_paths(node, current_path=""):
    """
    Recursively extract all node paths from the hierarchy tree.
    Returns a list of paths as strings like "Topic/Subtopic/SubSubtopic"
    """
    # Build the current path by appending the node's title
    if current_path:
        node_path = f"{current_path}/{node['title']}"
    else:
        node_path = node['title']

    paths = [node_path]

    if 'children' in node:
        for child in node['children']:
            child_paths = extract_all_node_paths(child, node_path)
            paths.extend(child_paths)

    return paths


def generate_hierarchy_from_text(text: str, max_depth: int = 4, max_children: int = 4):
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = f"""
    Given the study material, and only the following study notes/materials:

    {text[:3000]}

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

    Do not at any point include a slash (/) in your output, especially in titles. Return ONLY valid, parseable JSON with no additional text, explanation, or markdown formatting.
    """

    response = client.responses.create(
        model="gpt-5-mini-2025-08-07",
        input=prompt
    )

    json_formatted_reply = json.loads(response.output_text)
    return json_formatted_reply
