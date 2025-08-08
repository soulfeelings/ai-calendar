import uvicorn
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from api import routers
from service.webhook_maintenance import WebhookMaintenanceService
from service.calendar_service import CalendarService
from service.calendar_cache_service import CalendarCacheService
from repository.calendar_repo import CalendarRepo
from cache import AsyncRedisManager

# Глобальная переменная для задач
maintenance_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Управление жизненным циклом приложения.
    """
    global maintenance_task

    # Startup
    calendar_repo = CalendarRepo()
    redis_manager = AsyncRedisManager()
    calendar_cache_service = CalendarCacheService(redis_manager=redis_manager)
    calendar_service = CalendarService(calendar_repo=calendar_repo, cache_service=calendar_cache_service)
    maintenance_service = WebhookMaintenanceService(calendar_service)

    # Запускаем фоновую задачу для обслуживания вебхуков
    maintenance_task = asyncio.create_task(
        maintenance_service.start_maintenance_scheduler(interval_hours=6)
    )

    yield

    # Shutdown
    if maintenance_task:
        maintenance_task.cancel()
        try:
            await maintenance_task
        except asyncio.CancelledError:
            pass

app = FastAPI(lifespan=lifespan)

for i in routers:
    app.include_router(i)

@app.get("/healthcheck")
async def healthcheck():
    return True

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True, host="0.0.0.0", port=8000)