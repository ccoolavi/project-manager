import os
from pydantic_settings import BaseSettings
from datetime import timedelta

class Settings(BaseSettings):
    # Database
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./test.db")

    # JWT
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CORS
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Environment
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = environment == "development"

    # Email
    smtp_server: str = os.getenv("SMTP_SERVER", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")

    # App
    app_name: str = "KaizenPM API"
    app_version: str = "1.0.0"

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
