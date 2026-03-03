from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent / ".env"

class Settings(BaseSettings):
    mongodb_uri: str
    openai_api_key: str
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "us-east-1"

    rapidapi_key: str
    rapidapi_host: str

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8"
    )

settings = Settings()