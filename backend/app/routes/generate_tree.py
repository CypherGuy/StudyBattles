from fastapi import APIRouter, HTTPException
from db import documents_collection, trees_collection, nodes_collection, sessions_collection
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

    # Return existing tree if already generated for this document
    existing_tree_id = document.get("tree_id")
    if existing_tree_id:
        existing_tree = trees_collection.find_one(
            {"_id": ObjectId(existing_tree_id)})
        if existing_tree:
            root = existing_tree["root"]
            add_paths_to_tree(root)
            set_locked_status(root)
            return {"tree_id": existing_tree_id, "root": root}

    hierarchy = generate_hierarchy_from_text(document_text)
    valid, msg = validate_tree(hierarchy)
    if not valid:
        raise ValueError(msg)

    set_locked_status(hierarchy)

    # Store in MongoDB
    tree = {
        "document_id": document_id,
        "document_name": document_name,
        "document_type": document_type,
        "root": hierarchy
    }

    result = trees_collection.insert_one(tree)
    tree_id = str(result.inserted_id)

    documents_collection.update_one({"_id": ObjectId(document_id)}, {
                                    "$set": {"tree_id": tree_id}})

    node_paths = extract_all_node_paths(hierarchy)
    for node_path in node_paths:
        node_doc = {
            "tree_id": tree_id,
            "node_path": node_path,
            "questions": []
        }
        nodes_collection.insert_one(node_doc)

    add_paths_to_tree(hierarchy)

    return {"tree_id": tree_id, "root": hierarchy}


def set_locked_status(node):
    # Leaf nodes are unlocked, parents are locked until children are beaten
    has_children = bool(node.get('children'))
    node['locked'] = has_children
    for child in node.get('children', []):
        set_locked_status(child)


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
    has_children = bool(node.get('children'))
    ret[node['path']] = "locked" if has_children else "available"
    for child in node.get('children', []):
        ret.update(extract_locked_status(child))
    return ret


def validate_tree(node, depth=0, max_depth=4, max_children=4):
    if not node.get("title"):
        return False, "Node doesn't have a title"

    if depth >= max_depth:
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

    {text[:7500]}

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
        "children": [
            {{
            "title": "Limits",
            "children": []
            }},
            {{
            "title": "Rate of Change",
            "children": []
            }}
        ]
        }},
        {{
        "title": "Integration",
        "children": [
            {{
            "title": "Antiderivatives",
            "children": []
            }},
            {{
            "title": "Fundamental Theorem",
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

    try:
        json_formatted_reply = json.loads(response.output_text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502, detail="LLM returned unstructured response. Please try again.")

    return json_formatted_reply
