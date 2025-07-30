from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_HOST: str = 'localhost'
    MONGO_PORT: int = 27017
    MONGO_USERNAME: str = 'user'
    MONGO_PASSWORD: str = 'password'
    MONGO_DB: str = 'db'


    class Config:
        env_file = ".env"
        extra = 'allow'

settings = Settings()