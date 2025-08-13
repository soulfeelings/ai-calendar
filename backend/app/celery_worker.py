#!/usr/bin/env python3
"""
Celery worker для обработки задач AI календаря.
Запуск: python celery_worker.py
"""

import sys
import os

# Добавляем текущую директорию в PATH для импорта модулей
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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
