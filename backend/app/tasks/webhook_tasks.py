from typing import Optional
import asyncio
import logging

from celery_app import celery_app
from cache import AsyncRedisManager
from repository.calendar_repo import CalendarRepo
from repository.googlerepo import GoogleOauthRepo
from service.calendar_cache_service import CalendarCacheService
from service.googleoauth import GoogleOauthService
from service.calendar_service import CalendarService

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_services():
    """Получение сервисов для Celery задач"""
    cache_accessor = AsyncRedisManager()
    google_repo = GoogleOauthRepo()
    calendar_repo = CalendarRepo()
    cache_service = CalendarCacheService(cache_accessor)
    google_oauth_service = GoogleOauthService(google_oauth_repo=google_repo)
    calendar_service = CalendarService(
        calendar_repo=calendar_repo,
        cache_service=cache_service,
        google_oauth_service=google_oauth_service
    )

    return calendar_service


@celery_app.task(bind=True, max_retries=3)
def process_calendar_webhook(
    self,
    channel_id: str,
    resource_state: str,
    resource_id: Optional[str] = None,
    resource_uri: Optional[str] = None,
    message_number: Optional[str] = None
):
    """
    Celery задача для обработки вебхуков Google Calendar.

    Args:
        channel_id: ID канала Google Calendar
        resource_state: Состояние ресурса (exists, sync, not_exists)
        resource_id: ID ресурса
        resource_uri: URI ресурса
        message_number: Номер сообщения
    """
    try:
        logger.info(f"Processing webhook for channel {channel_id}, state: {resource_state}")

        # Игнорируем неактуальные состояния
        if resource_state not in ["exists", "sync"]:
            logger.info(f"Ignoring resource state: {resource_state}")
            return {"status": "ignored", "reason": f"Resource state {resource_state} not processed"}

        # Получаем сервисы
        calendar_service = get_services()

        # Выполняем асинхронную обработку
        loop = asyncio.get_event_loop()

        try:
            result = loop.run_until_complete(
                _process_webhook_async(
                    calendar_service,
                    channel_id,
                    resource_id,
                    resource_uri
                )
            )
            logger.info(f"Successfully processed webhook for channel {channel_id}")
            return result
        except:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

    except Exception as exc:
        logger.error(f"Error processing webhook for channel {channel_id}: {str(exc)}")

        # Повторяем задачу при ошибке
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying webhook processing, attempt {self.request.retries + 1}")
            raise self.retry(countdown=60 * (2 ** self.request.retries))  # Экспоненциальная задержка

        # Если исчерпаны все попытки
        logger.error(f"Failed to process webhook after {self.max_retries} retries")
        raise


async def _process_webhook_async(
    calendar_service: CalendarService,
    channel_id: str,
    resource_id: Optional[str],
    resource_uri: Optional[str]
):
    """
    Асинхронная обработка вебхука
    """
    # Получаем user_id по channel_id
    user_id = await calendar_service.get_user_by_channel_id(channel_id)
    print(user_id, channel_id)

    if not user_id:
        logger.warning(f"User not found for channel {channel_id}")
        raise ValueError(f"Channel {channel_id} not found, {user_id} user_id")

    # Обновляем события календаря
    await calendar_service.handle_calendar_change_notification(
        user_id=user_id,
        channel_id=channel_id,
        resource_id=resource_id,
        resource_uri=resource_uri
    )

    # Инвалидируем кеш для пользователя
    await calendar_service.cache_service.invalidate_user_cache(user_id)

    return {
        "status": "success",
        "message": "Webhook processed successfully",
        "user_id": user_id,
        "channel_id": channel_id
    }
