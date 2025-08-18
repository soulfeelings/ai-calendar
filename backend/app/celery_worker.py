#!/usr/bin/env python3
"""
Celery worker для обработки задач AI календаря.
Запуск: python celery_worker.py
"""

from celery_app import celery_app

if __name__ == '__main__':
    # Запускаем Celery worker с настройками для Docker
    celery_app.start([
        'worker',
        '--loglevel=info',
        '--concurrency=4',
        '--queues=webhook_queue,celery',
        '--hostname=ai_calendar_worker@%h',
        '--without-gossip',
        '--without-mingle',
        '--without-heartbeat'
    ])
