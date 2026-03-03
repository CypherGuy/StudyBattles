from typing import List, Optional
from pydantic import BaseModel

class TreeNode(BaseModel):
    title: str
    children: List['TreeNode'] = [] 
    # We use children and not parents becuase if children is empty, it's a leaf node
    locked: bool = True

class Tree(BaseModel):
    document_id: str
    root: TreeNode