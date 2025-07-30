from motor.motor_asyncio import AsyncIOMotorClient
from settings import settings

class MongoDB:
    def __init__(self, host: str, port: int, username: str, password: str, db: str):
        self.client = AsyncIOMotorClient(
            host=host,
            port=port,
            username=username,
            password=password,
            authMechanism="SCRAM-SHA-256",
        )
        self.db = self.client[db]

        #Инициализация коллекц
        self.goals = self.db.goals
        self.suggestions = self.db.suggestions


mongodb = MongoDB(
    host=settings.MONGO_HOST,
    port=settings.MONGO_PORT,
    username=settings.MONGO_USERNAME,
    password=settings.MONGO_PASSWORD,
    db=settings.MONGO_DB,
)