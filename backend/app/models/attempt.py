from pydantic import BaseModel
from datetime import datetime


class AttemptModel(BaseModel):
    # The full doc that gets stored into MongoDB
    tree_id: str
    session_id: str
    node_path: str
    question_text: str
    user_answer: str
    marks_received: int
    marks_total: int
    attempted_at: datetime


class AttemptRequest(BaseModel):
    # This is the request we get from the client which we then manipulate into an AttemptModel
    tree_id: str
    node_path: str
    question_text: str
    user_answer: str
    marks_received: int
    marks_total: int
