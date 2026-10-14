from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_anon_key: str

    public_api_url: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000"
    # The Vercel project's production domain and its preview deployments.
    cors_origin_regex: str = r"https://workout-delta-two\.vercel\.app|https://workout-[a-z0-9]+-innebandyanalys\.vercel\.app"

    storage_backend: str = "local"  # local | s3
    local_storage_dir: str = "./data/storage"
    media_signing_secret: str = "dev-only-change-me"
    s3_bucket: str | None = None
    s3_endpoint: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_region: str = "auto"

    worker_mode: str = "inline"  # inline | modal
    playback_url_ttl_s: int = 6 * 3600


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
