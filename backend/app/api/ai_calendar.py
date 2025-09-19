from fastapi import APIRouter, HTTPException, Depends, status
from typing import Annotated
import logging

from schemas.event_schemas import CalendarAnalysisRequest
from schemas.openai_schemas import (
    SchedulePlanningRequest,
    GoalAnalysisResponse,
    FullScheduleRequest,
    FullScheduleResponse
)
from service import OpenAIService
from dependencies import get_user_request_id, get_openai_service, get_goals_repo
from repository.goals_repo import GoalsRepository

router = APIRouter(prefix="/ai", tags=["AI Calendar Analysis"])
logger = logging.getLogger(__name__)


@router.post("/analyze-calendar", response_model=dict)
async def analyze_calendar_and_goals(
    request: CalendarAnalysisRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id),
):
    """
    Анализ календаря пользователя и его SMART целей (асинхронно через FastAPI)

    Поддерживает разные типы анализа:
    - 'week': анализ на ближайшую неделю
    - 'tomorrow': анализ на завтра
    - 'general': общий анализ календаря
    """
    try:
        analysis_type: str = request.analysis_type or 'general'
        logger.info(f"Starting calendar analysis for user {user_id}, type: {analysis_type}")
        logger.info(f"Received {len(request.calendar_events)} events for analysis")

        # Преобразуем события календаря в словари
        calendar_events_dict = [event.model_dump() for event in request.calendar_events]

        # Выполняем анализ асинхронно с учетом типа анализа
        result = await openai_service.analyze_calendar_and_goals(
            calendar_events=calendar_events_dict,
            user_goals=request.user_goals,
            analysis_period_days=request.analysis_period_days or 7,
            analysis_type=str(analysis_type)
        )

        logger.info(f"Calendar analysis completed successfully for user {user_id}, type: {analysis_type}")
        return result

    except Exception as e:
        logger.error(f"Error in calendar analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при анализе календаря: {str(e)}"
        )


@router.post("/plan-goal", response_model=dict)
async def plan_goal_schedule(
    request: SchedulePlanningRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Планирование расписания для конкретной SMART цели (асинхронно)
    """
    try:
        logger.info(f"Starting goal planning for user {user_id}")

        # Преобразуем свободные слоты в словари
        free_slots_dict = [slot.model_dump() for slot in request.free_time_slots]
        goal_dict = request.goal.model_dump()

        # Выполняем планирование асинхронно
        result = await openai_service.generate_schedule_suggestion(
            free_time_slots=free_slots_dict,
            goal=goal_dict,
            context=request.context or ""
        )

        logger.info(f"Goal planning completed successfully for user {user_id}")
        return result

    except Exception as e:
        logger.error(f"Error in goal planning: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при планировании цели: {str(e)}"
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


@router.post("/create-full-schedule", response_model=FullScheduleResponse)
async def create_full_schedule(
    request: FullScheduleRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Создание полного расписания на день или неделю на основе целей пользователя

    Поддерживает типы:
    - 'tomorrow': полное расписание на завтра
    - 'week': полное расписание на неделю

    Дополнительно:
    - ignore_existing_events: если True — полностью игнорировать существующие события календаря
    """
    try:
        logger.info(f"Starting full schedule creation for user {user_id}, type: {request.schedule_type}")
        logger.info(f"Received {len(request.user_goals)} goals for planning")

        # Преобразуем цели в словари (JSON-совместимые)
        goals_dict = [goal.model_dump(mode='json') for goal in request.user_goals]

        # Преобразуем существующие события если есть (JSON-совместимые)
        existing_events_dict = []
        if request.existing_events:
            existing_events_dict = [event.model_dump(mode='json') for event in request.existing_events]

        # Создаем полное расписание
        result = await openai_service.create_full_schedule(
            schedule_type=request.schedule_type,
            user_goals=goals_dict,
            existing_events=existing_events_dict,
            work_hours_start=request.work_hours_start,
            work_hours_end=request.work_hours_end,
            break_duration_minutes=request.break_duration_minutes,
            buffer_between_events_minutes=request.buffer_between_events_minutes,
            preferences=request.preferences,
            ignore_existing_events=bool(request.ignore_existing_events)
        )

        logger.info(f"Full schedule creation completed for user {user_id}, type: {request.schedule_type}")
        return FullScheduleResponse(**result)

    except Exception as e:
        logger.error(f"Error in full schedule creation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании расписания: {str(e)}"
        )


@router.put("/goals/{goal_id}", response_model=dict)
async def update_goal(
    goal_id: str,
    goal_data: dict,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Обновление существующей цели с повторным SMART анализом
    """
    try:
        # Проверяем, что цель принадлежит пользователю
        existing_goal = await goals_repo.get_goal_by_id(user_id, goal_id)
        if not existing_goal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Цель не найдена"
            )

        # Проводим SMART анализ обновленной цели
        smart_analysis = await openai_service.analyze_goal_smart(
            title=goal_data.get("title", ""),
            description=goal_data.get("description", ""),
            deadline=goal_data.get("deadline")
        )

        # Добавляем результат анализа к данным цели
        goal_data["smart_analysis"] = smart_analysis

        # Обновляем цель в БД
        await goals_repo.update_goal(user_id, goal_id, goal_data)

        return {
            "id": goal_id,
            "message": "Цель обновлена успешно",
            "smart_analysis": smart_analysis,
            **goal_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении цели: {str(e)}"
        )


@router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: str,
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Удаление цели
    """
    try:
        # Проверяем, что цель принадлежит пользователю
        existing_goal = await goals_repo.get_goal_by_id(user_id, goal_id)
        if not existing_goal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Цель не найдена"
            )

        # Удаляем цель из БД
        await goals_repo.delete_goal(user_id, goal_id)

        return {"message": "Цель удалена успешно"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении цели: {str(e)}"
        )
