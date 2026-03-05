from typing import List
from pydantic import BaseModel


class Node(BaseModel):
    tree_id: str
    node_path: str
    questions: List[str]
