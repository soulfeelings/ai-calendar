from fastapi import Depends, APIRouter, Body, Query
from dependencies import get_user_request_id, get_calendar_service, get_calendar_cache_service
from typing import Annotated, Optional, List, Dict, Any
from service import CalendarService
from service.calendar_cache_service import CalendarCacheService
from schemas.event_schemas import UpdateEventRequest, EventUpdateResponse

router = APIRouter(prefix="/calendar", tags=["google_calendar"])


@router.get("/list")
async def get_calendar_list(
    user_id: Annotated[str, Depends(get_user_request_id)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    return await calendar_service.get_calendar_list(user_id)

@router.post("/code")
async def update_scope(
    user_id: Annotated[str, Depends(get_user_request_id)],
    code: Annotated[str, Body(embed=True)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    return await calendar_service.update_user_scope(user_id, code)

@router.get("/events")
async def get_all_calendar_events(
    user_id: Annotated[str, Depends(get_user_request_id)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
    forcefullsync: Optional[bool] = Query(default=False),
    fullresponse: Optional[bool] = Query(default=False),
):
    return await calendar_service.get_all_user_calendar_events(user_id, forcefullsync, fullresponse)

@router.get("/event/{event_id}")
async def get_event(
    user_id: Annotated[str, Depends(get_user_request_id)],
    event_id: str,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)]
):
    return await calendar_service.get_event_from_id(user_id, event_id)

@router.put("/event/{event_id}")
async def update_event_by_webhook(
    user_id: Annotated[str, Depends(get_user_request_id)],
    event_id: str,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)]
):
    """
    Обновляет конкретное событие по ID с использованием etag для проверки изменений.
    Этот endpoint вызывается автоматически при получении вебхука.
    """
    return await calendar_service.update_event_from_webhook(user_id, event_id)

@router.post("/webhook-setup")
async def setup_calendar_webhook(
    user_id: Annotated[str, Depends(get_user_request_id)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)]
):
    """
    Настройка подписки на вебхуки для календаря пользователя.
    """
    return await calendar_service.setup_calendar_webhook(user_id)

@router.get("/cache/stats")
async def get_cache_statistics(
    user_id: Annotated[str, Depends(get_user_request_id)],
    cache_service: Annotated[CalendarCacheService, Depends(get_calendar_cache_service)]
):
    """
    Получение статистики кеша пользователя.
    """
    return await cache_service.get_cache_stats(user_id)

@router.delete("/cache/clear")
async def clear_user_cache(
    user_id: Annotated[str, Depends(get_user_request_id)],
    cache_service: Annotated[CalendarCacheService, Depends(get_calendar_cache_service)]
):
    """
    Очистка всего кеша пользователя.
    """
    success = await cache_service.invalidate_user_cache(user_id)
    return {
        "status": "success" if success else "error",
        "message": "User cache cleared successfully" if success else "Failed to clear cache"
    }

@router.patch("/event/{event_id}")
async def update_event(
    user_id: Annotated[str, Depends(get_user_request_id)],
    event_id: str,
    update_data: UpdateEventRequest,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)]
) -> EventUpdateResponse:
    """
    Обновляет существующее событие в Google Calendar.

    Поддерживает частичное обновление - передавайте только те поля, которые нужно изменить.
    Все поля в запросе опциональные.

    Args:
        event_id: ID события для обновления
        update_data: Данные для обновления (все поля опциональные)

    Returns:
        EventUpdateResponse: Результат обновления события

    Example:
        PATCH /calendar/event/abc123
        {
            "summary": "Новое название встречи",
            "description": "Обновленное описание",
            "start": {
                "dateTime": "2025-01-15T10:00:00+03:00",
                "timeZone": "Europe/Moscow"
            },
            "end": {
                "dateTime": "2025-01-15T11:00:00+03:00",
                "timeZone": "Europe/Moscow"
            }
        }
    """
    return await calendar_service.update_event(user_id, event_id, update_data)

@router.patch("/events/bulk")
async def bulk_update_events(
    user_id: Annotated[str, Depends(get_user_request_id)],
    event_updates: List[Dict[str, Any]],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)]
) -> List[EventUpdateResponse]:
    """
    Массовое обновление нескольких событий.

    Args:
        event_updates: Список объектов с event_id и update_data

    Returns:
        List[EventUpdateResponse]: Результаты обновления каждого события

    Example:
        PATCH /calendar/events/bulk
        [
            {
                "event_id": "abc123",
                "update_data": {
                    "summary": "Встреча 1 - обновлено",
                    "location": "Офис А"
                }
            },
            {
                "event_id": "def456",
                "update_data": {
                    "description": "Новое описание для встречи 2"
                }
            }
        ]
    """
    return await calendar_service.bulk_update_events(user_id, event_updates)
