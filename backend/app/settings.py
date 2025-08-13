from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_HOST: str = 'localhost'
    MONGO_PORT: int = 27017
    MONGO_USERNAME: str = 'user'
    MONGO_PASSWORD: str = 'password'
    MONGO_DB: str = 'db'

    REDIS_HOST: str = 'localhost'
    REDIS_PORT: str = '6379'
    REDIS_PASSWORD: str = 'secret'

    CLIENT_ID: str = 'client_id'
    CLIENT_SECRET: str = 'client_secret'

    SECRET_JWT_KEY: str = 'secret'

    # Webhook settings
    WEBHOOK_BASE_URL: str = 'https://your-domain.com'

    # Celery settings
    CELERY_BROKER_URL: str = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"
    CELERY_RESULT_BACKEND: str = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"

    # Cache settings
    CACHE_TTL_SECONDS: int = 360  # 6 минут

    class Config:
        env_file = ".env"
        extra = 'allow'

settings = Settings()