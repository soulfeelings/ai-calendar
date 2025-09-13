from typing import Optional, List, Dict, Any
import asyncio
import logging
import json

from celery_app import celery_app
from service.openai_service import OpenAIService

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_openai_service():
    """Получение OpenAI сервиса для Celery задач"""
    return OpenAIService()


@celery_app.task(bind=True, max_retries=3)
def analyze_calendar_and_goals_task(
    self,
    calendar_events: List[Dict],
    user_goals: List[Dict],
    user_id: str,
    analysis_period_days: int = 7
):
    """
    Celery задача для анализа календаря и целей пользователя.

    Args:
        calendar_events: События календаря
        user_goals: SMART цели пользователя
        user_id: ID пользователя для логирования
        analysis_period_days: Период анализа в днях

    Returns:
        Анализ и рекомендации от ИИ
    """
    try:
        logger.info(f"Starting calendar analysis for user {user_id}")

        # Получаем сервис OpenAI
        openai_service = get_openai_service()

        # Выполняем асинхронную обработку правильно
        result = asyncio.run(
            openai_service.analyze_calendar_and_goals(
                calendar_events=calendar_events,
                user_goals=user_goals,
                analysis_period_days=analysis_period_days
            )
        )

        logger.info(f"Successfully completed calendar analysis for user {user_id}")
        return {
            "status": "success",
            "user_id": user_id,
            "analysis": result,
            "timestamp": None  # Убираем проблематичное получение времени из event loop
        }

    except Exception as exc:
        logger.error(f"Error analyzing calendar for user {user_id}: {str(exc)}")

        # Повторяем задачу при ошибке
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying calendar analysis for user {user_id}, attempt {self.request.retries + 1}")
            raise self.retry(countdown=60 * (2 ** self.request.retries))  # Экспоненциальная задержка

        # Если исчерпаны все попытки
        logger.error(f"Failed to analyze calendar for user {user_id} after {self.max_retries} retries")
        return {
            "status": "error",
            "user_id": user_id,
            "error": str(exc),
            "analysis": {
                "summary": "Ошибка при анализе календаря",
                "recommendations": ["Попробуйте позже"],
                "schedule_changes": [],
                "goal_alignment": "Не удалось определить"
            }
        }


@celery_app.task(bind=True, max_retries=3)
def generate_schedule_suggestion_task(
    self,
    free_time_slots: List[Dict],
    goal: Dict,
    user_id: str,
    context: str = ""
):
    """
    Celery задача для генерации предложения по планированию конкретной цели.

    Args:
        free_time_slots: Свободные временные слоты
        goal: Конкретная SMART цель
        user_id: ID пользователя для логирования
        context: Дополнительный контекст

    Returns:
        Предложение по планированию
    """
    try:
        logger.info(f"Starting schedule suggestion generation for user {user_id}")

        # Получаем сервис OpenAI
        openai_service = get_openai_service()

        # Выполняем асинхронную обработку правильно
        result = asyncio.run(
            openai_service.generate_schedule_suggestion(
                free_time_slots=free_time_slots,
                goal=goal,
                context=context
            )
        )

        logger.info(f"Successfully generated schedule suggestion for user {user_id}")
        return {
            "status": "success",
            "user_id": user_id,
            "suggestion": result,
            "timestamp": None
        }

    except Exception as exc:
        logger.error(f"Error generating schedule suggestion for user {user_id}: {str(exc)}")

        # Повторяем задачу при ошибке
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying schedule suggestion for user {user_id}, attempt {self.request.retries + 1}")
            raise self.retry(countdown=60 * (2 ** self.request.retries))  # Экспоненциальная задержка

        # Если исчерпаны все попытки
        logger.error(f"Failed to generate schedule suggestion for user {user_id} after {self.max_retries} retries")
        return {
            "status": "error",
            "user_id": user_id,
            "error": str(exc),
            "suggestion": {
                "suggested_time": "Не определено",
                "duration": "Не определено",
                "frequency": "Не определено",
                "reasoning": "Ошибка при генерации предложения"
            }
        }


@celery_app.task(bind=True, max_retries=3)
def create_chat_completion_task(
    self,
    messages: List[Dict[str, str]],
    user_id: str,
    model: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    system_prompt: Optional[str] = None,
    response_format: Optional[Dict[str, Any]] = None
):
    """
    Celery задача для создания чат-завершения через OpenAI API.

    Args:
        messages: Список сообщений в формате [{"role": "user", "content": "text"}]
        user_id: ID пользователя для логирования
        model: Модель для использования (по умолчанию из settings)
        max_tokens: Максимальное количество токенов
        temperature: Температура генерации
        system_prompt: Системный промпт
        response_format: Принудительный формат ответа

    Returns:
        Ответ от OpenAI API
    """
    try:
        logger.info(f"Starting chat completion for user {user_id}")

        # Получаем сервис OpenAI
        openai_service = get_openai_service()

        # Выполняем асинхронную обработку правильно
        result = asyncio.run(
            openai_service.create_chat_completion(
                messages=messages,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system_prompt=system_prompt,
                response_format=response_format
            )
        )

        logger.info(f"Successfully completed chat completion for user {user_id}")
        return {
            "status": "success",
            "user_id": user_id,
            "response": result,
            "timestamp": None
        }

    except Exception as exc:
        logger.error(f"Error in chat completion for user {user_id}: {str(exc)}")

        # Повторяем задачу при ошибке
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying chat completion for user {user_id}, attempt {self.request.retries + 1}")
            raise self.retry(countdown=30 * (2 ** self.request.retries))  # Более быстрая повторная попытка

        # Если исчерпаны все попытки
        logger.error(f"Failed chat completion for user {user_id} after {self.max_retries} retries")
        return {
            "status": "error",
            "user_id": user_id,
            "error": str(exc),
            "response": None
        }


# Вспомогательные функции для быстрого запуска задач

def start_calendar_analysis(
    calendar_events: List[Dict],
    user_goals: List[Dict],
    user_id: str,
    analysis_period_days: int = 7
):
    """Запуск анализа календаря в фоне"""
    return analyze_calendar_and_goals_task.delay(
        calendar_events=calendar_events,
        user_goals=user_goals,
        user_id=user_id,
        analysis_period_days=analysis_period_days
    )


def start_schedule_suggestion(
    free_time_slots: List[Dict],
    goal: Dict,
    user_id: str,
    context: str = ""
):
    """Запуск генерации предложения по планированию в фоне"""
    return generate_schedule_suggestion_task.delay(
        free_time_slots=free_time_slots,
        goal=goal,
        user_id=user_id,
        context=context
    )


def start_chat_completion(
    messages: List[Dict[str, str]],
    user_id: str,
    **kwargs
):
    """Запуск чат-завершения в фоне"""
    return create_chat_completion_task.delay(
        messages=messages,
        user_id=user_id,
        **kwargs
    )
