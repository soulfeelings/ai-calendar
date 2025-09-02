from fastapi import APIRouter, Request, HTTPException, Depends, Header
from typing import Annotated, Optional
from service import CalendarService
from dependencies import get_calendar_service
from tasks.webhook_tasks import process_calendar_webhook

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
    Получает уведомления об изменениях в календаре и отправляет задачу в Celery для асинхронной обработки.
    """
    try:
        # Проверяем обязательные заголовки
        if not x_goog_channel_id or not x_goog_resource_state:
            raise HTTPException(status_code=400, detail="Missing required headers")

        # Обрабатываем только уведомления об изменениях
        if x_goog_resource_state not in ["exists", "sync"]:
            return {"status": "ignored", "reason": f"Resource state {x_goog_resource_state} not processed"}

        # Отправляем задачу в Celery для асинхронной обработки
        task = process_calendar_webhook.delay(
            channel_id=x_goog_channel_id,
            resource_state=x_goog_resource_state,
            resource_id=x_goog_resource_id,
            resource_uri=x_goog_resource_uri,
            message_number=x_goog_message_number
        )

        return {
            "status": "accepted",
            "message": "Webhook queued for processing",
            "task_id": task.id,
            "channel_id": x_goog_channel_id
        }

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


@router.get("/task-status/{task_id}")
async def get_task_status(task_id: str):
    """
    Получение статуса выполнения Celery задачи.
    """
    try:
        from celery_app import celery_app

        result = celery_app.AsyncResult(task_id)

        return {
            "task_id": task_id,
            "status": result.status,
            "result": result.result if result.ready() else None,
            "info": result.info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get task status: {str(e)}")
