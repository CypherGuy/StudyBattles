from typing import Dict
from pydantic import BaseModel


class SessionModel(BaseModel):
    tree_id: str
    session_id: str
    node_unlock_status: Dict[str, bool]
