from pydantic import BaseModel
from datetime import datetime


class DocumentModel(BaseModel):
    name: str
    extracted_text: str
    file_type: str  # pptx, docx, youtube
    upload_time: datetime
    session_id: str | None = None
