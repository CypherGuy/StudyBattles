from pydantic import BaseModel
from datetime import datetime


class AttemptModel(BaseModel):
    tree_id: str
    session_id: str
    node_path: str
    question_text: str
    user_answer: str
    marks_received: int
    marks_total: int
    attempted_at: datetime


class AttemptRequest(BaseModel):
    tree_id: str
    node_path: str
    question_text: str
    user_answer: str
    marks_received: int
    marks_total: int
