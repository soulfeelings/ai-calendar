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
        self.users = self.db.users
        self.refresh_tokens = self.db.refresh_tokens
        self.goals = self.db.goals
        self.suggestions = self.db.suggestions
        self.calendarlist = self.db.calendarlist
        self.calendarevents = self.db.calendar_events
        self.webhook_subscriptions = self.db.webhook_subscriptions


mongodb = MongoDB(
    host=settings.MONGO_HOST,
    port=settings.MONGO_PORT,
    username=settings.MONGO_USERNAME,
    password=settings.MONGO_PASSWORD,
    db=settings.MONGO_DB,
)
