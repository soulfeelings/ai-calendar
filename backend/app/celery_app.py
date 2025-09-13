from celery import Celery
from settings import settings

celery_app = Celery(
    "ai_calendar",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        'tasks.webhook_tasks',
        'tasks.openai_tasks'  # Добавляем новые OpenAI задачи
    ],
    broker_transport_options={
        'visibility_timeout': 3600,
        'fanout_prefix': True,
        'master_name': 'mymaster'  # Для Redis Sentinel если используется
    }
)

# Настройки Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Europe/Moscow',  # Устанавливаем правильную временную зону
    enable_utc=False,          # Отключаем UTC для удобства работы с локальным временем

    # Маршрутизация задач по очередям
    task_routes={
        'tasks.webhook_tasks.process_calendar_webhook': {'queue': 'webhook_queue'},
        'tasks.openai_tasks.analyze_calendar_and_goals_task': {'queue': 'ai_queue'},
        'tasks.openai_tasks.generate_schedule_suggestion_task': {'queue': 'ai_queue'},
        'tasks.openai_tasks.create_chat_completion_task': {'queue': 'ai_queue'},
    },

    # Настройки воркеров
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=100,  # Уменьшаем для освобождения памяти
    worker_send_task_events=True,
    event_queue_expires=60,

    # Настройки результатов
    result_expires=3600,  # Результаты хранятся 1 час
    task_ignore_result=False,

    # Настройки повторных попыток
    task_default_retry_delay=60,
    task_max_retries=3,

    # Настройки тайм-аутов
    task_soft_time_limit=300,   # 5 минут мягкий лимит
    task_time_limit=600,        # 10 минут жесткий лимит

    # Настройки для работы с async/await
    task_always_eager=False,    # Отключаем eager режим для продакшена
)