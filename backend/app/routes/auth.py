from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from dependencies import VALID_TOKEN


router = APIRouter()


class PasswordRequest(BaseModel):
    password: str


@router.post("/auth/verify")
def verify_password(body: PasswordRequest):
    if body.password != settings.access_password:
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": VALID_TOKEN}
