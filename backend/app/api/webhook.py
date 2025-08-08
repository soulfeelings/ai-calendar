from fastapi import APIRouter, Request, HTTPException, Depends, Header
from typing import Annotated, Optional
from service import CalendarService
from dependencies import get_calendar_service
import json
import hmac
import hashlib
from settings import settings

router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.post("/google-calendar")
async def google_calendar_webhook(
    request: Request,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
    x_goog_channel_id: Optional[str] = Header(None),
    x_goog_channel_token: Optional[str] = Header(None),
    x_goog_resource_id: Optional[str] = Header(None),
    x_goog_resource_uri: Optional[str] = Header(None),
    x_goog_resource_state: Optional[str] = Header(None),
    x_goog_message_number: Optional[str] = Header(None),
):
    """
    Обработчик вебхука от Google Calendar.
    Получает уведомления об изменениях в календаре и обновляет данные в БД.
    """
    try:
        # Проверяем обязательные заголовки
        if not x_goog_channel_id or not x_goog_resource_state:
            raise HTTPException(status_code=400, detail="Missing required headers")

        # Обрабатываем только уведомления об изменениях
        if x_goog_resource_state not in ["exists", "sync"]:
            return {"status": "ignored", "reason": f"Resource state {x_goog_resource_state} not processed"}

        # Получаем user_id по channel_id
        user_id = await calendar_service.get_user_by_channel_id(x_goog_channel_id)
        
        if not user_id:
            raise HTTPException(status_code=404, detail="Channel not found")

        # Обновляем события календаря с использованием incremental sync
        await calendar_service.handle_calendar_change_notification(
            user_id=user_id,
            channel_id=x_goog_channel_id,
            resource_id=x_goog_resource_id,
            resource_uri=x_goog_resource_uri
        )

        return {"status": "success", "message": "Webhook processed successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Webhook processing failed: {str(e)}")


@router.post("/setup/{user_id}")
async def setup_webhook_subscription(
    user_id: str,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    """
    Настройка подписки на вебхуки для пользователя.
    """
    try:
        subscription_info = await calendar_service.setup_calendar_webhook(user_id)
        return {
            "status": "success", 
            "message": "Webhook subscription created",
            "subscription": subscription_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to setup webhook: {str(e)}")


@router.delete("/unsubscribe/{channel_id}")
async def unsubscribe_webhook(
    channel_id: str,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    """
    Отписка от вебхука по channel_id.
    """
    try:
        await calendar_service.unsubscribe_calendar_webhook(channel_id)
        return {"status": "success", "message": "Webhook unsubscribed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unsubscribe webhook: {str(e)}")


@router.get("/status/{user_id}")
async def get_webhook_status(
    user_id: str,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    """
    Получение статуса подписки на вебхуки для пользователя.
    """
    try:
        status = await calendar_service.get_webhook_status(user_id)
        return {"status": "success", "webhook_status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get webhook status: {str(e)}")
