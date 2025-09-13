from celery import Celery
from settings import settings
import os

# Устанавливаем переменную окружения для Celery
os.environ.setdefault('CELERY_CONFIG_MODULE', 'celery_app')

celery_app = Celery(
    "ai_calendar",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        'tasks.webhook_tasks',
        'tasks.openai_tasks'
    ]
)

# Настройки Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Europe/Moscow',
    enable_utc=False,

    # Упрощенная маршрутизация - используем default очередь
    task_default_queue='default',
    task_default_exchange='default',
    task_default_exchange_type='direct',
    task_default_routing_key='default',

    # Настройки воркеров
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=100,
    worker_send_task_events=True,

    # Настройки результатов
    result_expires=3600,
    task_ignore_result=False,

    # Настройки тайм-аутов
    task_soft_time_limit=300,
    task_time_limit=600,

    # Важно: автообнаружение задач
    task_always_eager=False,

    # Настройки Redis
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,
)