from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql://postgres:postgres@localhost:5432/transcriptor"
    test_database_url: str = "postgresql://postgres:postgres@localhost:5432/transcriptor_test"
    consent_version: str = "1.0"
    dev_mode: bool = False
    local_data_dir: str = "data_sample"
    images_serve_origin: str = ""
    admin_emails: list[str] = []
    submitter_fingerprint_salt: str = ""

    @field_validator("admin_emails", mode="before")
    @classmethod
    def parse_admin_emails(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [e.strip() for e in v.split(",") if e.strip()]
        return v  # type: ignore[return-value]


settings = Settings()
