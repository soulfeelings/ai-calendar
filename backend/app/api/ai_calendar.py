from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Annotated
import logging
from datetime import datetime

from schemas.openai_schemas import (
    CalendarAnalysisRequest,
    CalendarAnalysisResponse,
    SchedulePlanningRequest,
    SchedulePlanningResponse,
    SMARTGoal,
    OpenAIRequest,
    OpenAIResponse,
    GoalAnalysisResponse
)
from service import OpenAIService
from dependencies import get_user_request_id, get_openai_service, get_goals_repo
from repository.goals_repo import GoalsRepository
from tasks.openai_tasks import (
    start_calendar_analysis,
    start_schedule_suggestion,
    start_chat_completion
)

router = APIRouter(prefix="/ai", tags=["AI Calendar Analysis"])
logger = logging.getLogger(__name__)


@router.post("/analyze-calendar", response_model=CalendarAnalysisResponse)
async def analyze_calendar_and_goals(
    request: CalendarAnalysisRequest,
    user_id: str = Depends(get_user_request_id),
):
    """
    Анализ календаря пользователя и его SMART целей (асинхронно)

    Запускает задачу в фоне и сразу возвращает task_id.
    API не блокируется, результат получается через polling.
    """
    try:
        logger.info(f"Starting async calendar analysis for user {user_id}")
        logger.info(f"Received {len(request.calendar_events)} events for analysis")

        # Преобразуем события календаря в словари
        calendar_events_dict = [event.model_dump() for event in request.calendar_events]

        # Запускаем задачу в фоне через Celery (НЕ ждем результат)
        task = start_calendar_analysis(
            calendar_events=calendar_events_dict,
            user_goals=request.user_goals,
            user_id=user_id,
            analysis_period_days=request.analysis_period_days or 7
        )

        logger.info(f"Calendar analysis task started with ID: {task.id}")

        # Сразу возвращаем task_id без ожидания
        return {
            "task_id": task.id,
            "status": "started",
            "message": "Анализ календаря запущен в фоне. Проверяйте статус по task_id.",
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Error starting calendar analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при запуске анализа календаря: {str(e)}"
        )


@router.post("/analyze-calendar-async")
async def analyze_calendar_and_goals_async(
    request: CalendarAnalysisRequest,
    user_id: str = Depends(get_user_request_id),
):
    """
    Запуск асинхронного анализа календаря без ожидания результата

    Returns:
        task_id для проверки статуса через /ai/task/{task_id}
    """
    try:
        logger.info(f"Starting async calendar analysis for user {user_id}")

        # Преобразуем события календаря в словари
        calendar_events_dict = [event.model_dump() for event in request.calendar_events]

        # Запускаем задачу в фоне
        task = start_calendar_analysis(
            calendar_events=calendar_events_dict,
            user_goals=request.user_goals,
            user_id=user_id,
            analysis_period_days=request.analysis_period_days or 7
        )

        return {
            "task_id": task.id,
            "status": "started",
            "message": "Анализ запущен в фоне. Проверяйте статус по task_id.",
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Error starting async calendar analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при запуске анализа: {str(e)}"
        )


@router.post("/plan-goal", response_model=dict)
async def plan_goal_schedule(
    request: SchedulePlanningRequest,
    user_id: str = Depends(get_user_request_id)
):
    """
    Планирование расписания для конкретной SMART цели (асинхронно через Celery)

    Этот эндпоинт запускает фоновую задачу планирования оптимального времени
    для работы над конкретной целью в свободных слотах календаря.
    """
    try:
        logger.info(f"Starting async goal planning for user {user_id}")

        # Преобразуем свободные слоты в словари
        free_slots_dict = [slot.model_dump() for slot in request.free_time_slots]
        goal_dict = request.goal.model_dump()

        # Запускаем задачу планирования в фоне через Celery
        task = start_schedule_suggestion(
            free_time_slots=free_slots_dict,
            goal=goal_dict,
            user_id=user_id,
            context=request.context or ""
        )

        logger.info(f"Goal planning task started with ID: {task.id}")

        return {
            "task_id": task.id,
            "status": "started",
            "message": "Планирование цели запущено. Используйте task_id для проверки статуса.",
            "user_id": user_id
        }

    except Exception as e:
        logger.error(f"Error starting goal planning: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при запуске планирования цели: {str(e)}"
        )


@router.post("/plan-goal-sync", response_model=SchedulePlanningResponse)
async def plan_goal_schedule_sync(
    request: SchedulePlanningRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Синхронное планирование расписания для цели

    ВНИМАНИЕ: Этот endpoint может быть медленным.
    Рекомендуется использовать асинхронную версию /plan-goal
    """
    try:
        logger.info(f"Starting sync goal planning for user {user_id}")

        # Преобразуем свободные слоты в словари
        free_slots_dict = [slot.model_dump() for slot in request.free_time_slots]
        goal_dict = request.goal.model_dump()

        # Вызываем сервис OpenAI для планирования
        ai_response = await openai_service.generate_schedule_suggestion(
            free_time_slots=free_slots_dict,
            goal=goal_dict,
            context=request.context or ""
        )

        # Формируем ответ
        response = SchedulePlanningResponse(
            suggested_time=ai_response.get("suggested_time", "Не определено"),
            duration=ai_response.get("duration", "Не определено"),
            frequency=ai_response.get("frequency", "Не определено"),
            reasoning=ai_response.get("reasoning", "Причина не указана"),
            suggested_events=ai_response.get("suggested_events", [])
        )

        logger.info(f"Sync goal planning completed successfully")
        return response

    except Exception as e:
        logger.error(f"Error in sync goal planning: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при планировании цели: {str(e)}"
        )


@router.get("/task/{task_id}")
async def get_task_status(
    task_id: str,
    user_id: str = Depends(get_user_request_id)
):
    """
    Получение статуса выполнения задачи Celery

    Используйте этот endpoint для проверки статуса асинхронных задач анализа календаря
    или планирования целей.
    """
    try:
        from celery_app import celery_app

        # Получаем результат задачи
        result = celery_app.AsyncResult(task_id)

        if result.state == 'PENDING':
            response = {
                "task_id": task_id,
                "state": result.state,
                "status": "pending",
                "message": "Задача ожидает выполнения"
            }
        elif result.state == 'PROGRESS':
            response = {
                "task_id": task_id,
                "state": result.state,
                "status": "in_progress",
                "message": result.info.get('message', 'Задача выполняется') if result.info else "Задача выполняется",
                "progress": result.info.get('progress', 0) if result.info else 0
            }
        elif result.state == 'SUCCESS':
            # ИСПРАВЛЕНИЕ: Получаем результат напрямую
            task_result = result.get()
            response = {
                "task_id": task_id,
                "state": result.state,
                "status": "completed",
                "message": "Задача выполнена успешно",
                "result": task_result  # Возвращаем результат напрямую
            }
        else:  # FAILURE
            response = {
                "task_id": task_id,
                "state": result.state,
                "status": "failed",
                "message": "Задача завершилась с ошибкой",
                "error": str(result.info) if result.info else "Неизвестная ошибка"
            }

        return response

    except Exception as e:
        logger.error(f"Error getting task status for {task_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении статуса задачи: {str(e)}"
        )


@router.post("/goals", response_model=dict)
async def create_goal(
    goal_data: dict,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Создание новой цели с SMART анализом
    """
    try:
        # Проводим SMART анализ цели
        smart_analysis = await openai_service.analyze_goal_smart(
            title=goal_data.get("title", ""),
            description=goal_data.get("description", ""),
            deadline=goal_data.get("deadline")
        )

        # Добавляем результат анализа к данным цели
        goal_data["smart_analysis"] = smart_analysis

        # Сохраняем цель в БД
        goal_id = await goals_repo.create_goal(user_id, goal_data)

        return {
            "id": goal_id,
            "message": "Цель создана успешно",
            "smart_analysis": smart_analysis,
            **goal_data
        }
    except Exception as e:
        logger.error(f"Error creating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании цели: {str(e)}"
        )


@router.get("/goals")
async def get_goals(
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    include_completed: bool = False,
    user_id: str = Depends(get_user_request_id),
):
    """
    Получение целей пользователя
    """
    try:
        goals = await goals_repo.get_user_goals(user_id, include_completed)
        return goals
    except Exception as e:
        logger.error(f"Error getting goals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении целей: {str(e)}"
        )


@router.post("/analyze-goal", response_model=GoalAnalysisResponse)
async def analyze_goal(
    goal_data: dict,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Анализ цели по критериям SMART
    """
    try:
        analysis = await openai_service.analyze_goal_smart(
            title=goal_data.get("title", ""),
            description=goal_data.get("description", ""),
            deadline=goal_data.get("deadline")
        )

        return GoalAnalysisResponse(**analysis)
    except Exception as e:
        logger.error(f"Error analyzing goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при анализе цели: {str(e)}"
        )


@router.post("/apply-schedule-change")
async def apply_schedule_change(
    change: dict,
    user_id: str = Depends(get_user_request_id)
):
    """
    Применение изменения в расписании
    """
    try:
        # Здесь должна быть логика применения изменений к календарю
        # Пока возвращаем успешный результат
        return {"success": True, "message": "Изменение применено успешно"}
    except Exception as e:
        logger.error(f"Error applying schedule change: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при применении изменения: {str(e)}"
        )


@router.post("/chat")
async def chat_with_ai(
    request: dict,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Общение с ИИ в чат-формате
    """
    try:
        messages = request.get("messages", [])
        system_prompt = request.get("system_prompt")
        model = request.get("model", "gpt-4o-mini")
        temperature = request.get("temperature", 0.7)
        max_tokens = request.get("max_tokens", 1000)

        response = await openai_service.create_chat_completion(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            system_prompt=system_prompt
        )

        content = response["choices"][0]["message"]["content"]
        return {"content": content}

    except Exception as e:
        logger.error(f"Error in AI chat: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при общении с ИИ: {str(e)}"
        )


@router.post("/analyze-calendar-sync")
async def analyze_calendar_and_goals_sync(
    request: CalendarAnalysisRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id),
):
    """
    Синхронный анализ календаря и целей (БЫСТРЫЙ)
    
    Возвращает результат сразу без использования Celery.
    Рекомендуется для простых случаев.
    """
    try:
        logger.info(f"Starting sync calendar analysis for user {user_id}")
        logger.info(f"Received {len(request.calendar_events)} events for analysis")

        # Преобразуем события календаря в словари
        calendar_events_dict = [event.model_dump() for event in request.calendar_events]

        # Выполняем анализ синхронно
        result = await openai_service.analyze_calendar_and_goals(
            calendar_events=calendar_events_dict,
            user_goals=request.user_goals,
            analysis_period_days=request.analysis_period_days or 7
        )

        logger.info(f"Sync calendar analysis completed successfully for user {user_id}")
        return result

    except Exception as e:
        logger.error(f"Error in sync calendar analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при синхронном анализе календаря: {str(e)}"
        )
