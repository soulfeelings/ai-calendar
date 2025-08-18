from celery import Celery
from settings import settings

celery_app = Celery(
    "ai_calendar",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=['tasks.webhook_tasks'],
    broker_transport_options={
        'visibility_timeout': 3600,
        'fanout_prefix': True
    }
)

# Настройки Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_routes={
        'tasks.webhook_tasks.process_calendar_webhook': {'queue': 'webhook_queue'},
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
    worker_send_task_events=True,  # Добавьте эту строку
    event_queue_expires=60,         # И эту
)