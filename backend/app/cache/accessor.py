import redis.asyncio as redis
from contextlib import asynccontextmanager
from settings import settings

class AsyncRedisManager:
    def __init__(self):
        self.pool = redis.ConnectionPool(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True,
            max_connections=25,
        )

    @asynccontextmanager
    async def get_client(self):
        """Контекстный менеджер для работы с Redis"""
        client = redis.Redis(connection_pool=self.pool)
        try:
            yield client
        finally:
            await client.close()

    async def get_celery_broker_url(self):
        """URL для Celery с учетом пароля"""
        conn = self.pool.connection_kwargs
        auth = f":{conn.get('password')}@" if conn.get("password") else ""
        return f"redis://{auth}{conn['host']}:{conn['port']}/0"


# Инициализация (лучше через Depends в FastAPI)