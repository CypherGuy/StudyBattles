import hmac
import hashlib

from fastapi import Header, HTTPException

from config import settings


def _make_token(password: str) -> str:
    return hmac.new(
        settings.secret_key.encode(),
        password.encode(),
        hashlib.sha256,
    ).hexdigest()


VALID_TOKEN = _make_token(settings.access_password)


def require_auth(authorization: str = Header(...)):
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != VALID_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
