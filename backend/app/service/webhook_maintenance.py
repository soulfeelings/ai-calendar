import asyncio
from datetime import datetime, timedelta
from service.calendar_service import CalendarService
from repository.calendar_repo import CalendarRepo
from database import mongodb
import logging

logger = logging.getLogger(__name__)

class WebhookMaintenanceService:
    """
    Сервис для автоматического обслуживания вебхуков.
    """
    
    def __init__(self, calendar_service: CalendarService):
        self.calendar_service = calendar_service
        self.calendar_repo = CalendarRepo()
    
    async def cleanup_expired_subscriptions(self):
        """
        Удаляет истекшие подписки из БД.
        """
        try:
            deleted_count = await self.calendar_repo.cleanup_expired_webhook_subscriptions()
            logger.info(f"Cleaned up {deleted_count} expired webhook subscriptions")
            return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up expired subscriptions: {str(e)}")
            return 0
    
    async def refresh_expiring_subscriptions(self):
        """
        Обновляет подписки, которые скоро истекут.
        """
        try:
            current_time = datetime.now().timestamp() * 1000
            refresh_threshold = 24 * 60 * 60 * 1000  # 24 часа в миллисекундах
            
            # Находим подписки, которые истекут в ближайшие 24 часа
            expiring_subscriptions = await mongodb.webhook_subscriptions.find({
                "expiration": {
                    "$lt": current_time + refresh_threshold,
                    "$gt": current_time
                }
            }).to_list(length=None)
            
            refreshed_count = 0
            for subscription in expiring_subscriptions:
                try:
                    user_id = subscription["user_id"]
                    
                    # Отписываемся от старого вебхука
                    await self.calendar_service.unsubscribe_calendar_webhook(
                        subscription["channel_id"]
                    )
                    
                    # Создаем новую подписку
                    await self.calendar_service.setup_calendar_webhook(user_id)
                    refreshed_count += 1
                    
                    logger.info(f"Refreshed webhook subscription for user {user_id}")
                    
                except Exception as e:
                    logger.error(f"Error refreshing subscription for user {subscription['user_id']}: {str(e)}")
                    continue
            
            logger.info(f"Refreshed {refreshed_count} webhook subscriptions")
            return refreshed_count
            
        except Exception as e:
            logger.error(f"Error refreshing expiring subscriptions: {str(e)}")
            return 0
    
    async def run_maintenance_cycle(self):
        """
        Выполняет полный цикл обслуживания вебхуков.
        """
        logger.info("Starting webhook maintenance cycle")
        
        # Удаляем истекшие подписки
        await self.cleanup_expired_subscriptions()
        
        # Обновляем истекающие подписки
        await self.refresh_expiring_subscriptions()
        
        logger.info("Webhook maintenance cycle completed")
    
    async def start_maintenance_scheduler(self, interval_hours: int = 6):
        """
        Запускает планировщик для периодического обслуживания вебхуков.
        """
        logger.info(f"Starting webhook maintenance scheduler with {interval_hours}h interval")
        
        while True:
            try:
                await self.run_maintenance_cycle()
                
                # Ждем указанный интервал
                await asyncio.sleep(interval_hours * 3600)
                
            except Exception as e:
                logger.error(f"Error in maintenance scheduler: {str(e)}")
                # В случае ошибки ждем меньше времени перед повторной попыткой
                await asyncio.sleep(30 * 60)  # 30 минут
