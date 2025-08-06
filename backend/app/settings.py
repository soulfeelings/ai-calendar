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

    class Config:
        env_file = ".env"
        extra = 'allow'

settings = Settings()