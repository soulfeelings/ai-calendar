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
    OpenAIResponse
)
from service import OpenAIService
from dependencies import get_user_request_id, get_openai_service, get_goals_repo
from repository.goals_repo import GoalsRepository

router = APIRouter(prefix="/ai", tags=["AI Calendar Analysis"])
logger = logging.getLogger(__name__)


@router.post("/analyze-calendar", response_model=CalendarAnalysisResponse)
async def analyze_calendar_and_goals(
    request: CalendarAnalysisRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id),
):
    """
    Анализ календаря пользователя и его SMART целей

    Этот эндпоинт отправляет данные календаря и цели пользователя в OpenAI,
    получает анализ и рекомендации по оптимизации расписания
    """
    try:
        logger.info(f"Starting calendar analysis for user {user_id}")

        # Преобразуем цели в словари для отправки в ИИ
        goals_dict = [goal.model_dump() for goal in request.user_goals]

        # Преобразуем события календаря в словари
        calendar_events_dict = [event.model_dump() for event in request.calendar_events]

        # Вызываем сервис OpenAI для анализа
        ai_response = await openai_service.analyze_calendar_and_goals(
            calendar_events=calendar_events_dict,
            user_goals=goals_dict,
            analysis_period_days=request.analysis_period_days
        )

        # Формируем ответ
        response = CalendarAnalysisResponse(
            analysis=ai_response.get("analysis", "Анализ не получен"),
            recommendations=ai_response.get("recommendations", []),
            schedule_changes=ai_response.get("schedule_changes", []),
            goal_alignment=ai_response.get("goal_alignment", "Не определено"),
            productivity_score=ai_response.get("productivity_score")
        )

        logger.info(f"Calendar analysis completed for user {user_id}")
        return response

    except Exception as e:
        logger.error(f"Error in analyze_calendar_and_goals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при анализе календаря: {str(e)}"
        )


@router.post("/plan-goal", response_model=SchedulePlanningResponse)
async def plan_goal_schedule(
    request: SchedulePlanningRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Планирование расписания для конкретной SMART цели

    Этот эндпоинт помогает найти оптимальное время для работы над конкретной целью
    в свободных слотах календаря
    """
    try:
        logger.info(f"Starting goal planning for user {user_id}")

        # Преобразуем данные для отправки в ИИ
        free_slots_dict = [slot.model_dump() for slot in request.free_time_slots]
        goal_dict = request.goal.model_dump()

        # Вызываем сервис OpenAI для планирования
        ai_response = await openai_service.generate_schedule_suggestion(
            free_time_slots=free_slots_dict,
            goal=goal_dict,
            context=request.context
        )

        # Формируем ответ
        response = SchedulePlanningResponse(
            suggested_time=ai_response.get("suggested_time", "Не определено"),
            duration=ai_response.get("duration", "Не определено"),
            frequency=ai_response.get("frequency", "Не определено"),
            reasoning=ai_response.get("reasoning", "Обоснование не предоставлено"),
            suggested_events=ai_response.get("suggested_events", [])
        )

        logger.info(f"Goal planning completed for user {user_id}")
        return response

    except Exception as e:
        logger.error(f"Error in plan_goal_schedule: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при планировании цели: {str(e)}"
        )


@router.post("/chat", response_model=OpenAIResponse)
async def chat_with_ai(
    request: OpenAIRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Прямое общение с OpenAI для кастомных запросов

    Позволяет отправить произвольный запрос в OpenAI для получения консультации
    по тайм-менеджменту и планированию
    """
    try:
        logger.info(f"Starting AI chat for user {user_id}")

        # Преобразуем сообщения в словари
        messages_dict = [message.model_dump() for message in request.messages]

        # Вызываем сервис OpenAI
        ai_response = await openai_service.create_chat_completion(
            messages=messages_dict,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system_prompt=request.system_prompt
        )

        # Извлекаем информацию из ответа
        choice = ai_response["choices"][0]
        content = choice["message"]["content"]

        response = OpenAIResponse(
            content=content,
            tokens_used=ai_response.get("usage", {}).get("total_tokens"),
            model=ai_response["model"],
            created=ai_response.get("created")
        )

        logger.info(f"AI chat completed for user {user_id}")
        return response

    except Exception as e:
        logger.error(f"Error in chat_with_ai: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при общении с ИИ: {str(e)}"
        )


@router.post("/goals", response_model=SMARTGoal)
async def create_smart_goal(
    goal: SMARTGoal,
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Создание новой SMART цели

    Сохраняет SMART цель пользователя для последующего анализа и планирования
    """
    try:
        logger.info(f"Creating SMART goal for user {user_id}")

        # Подготавливаем данные для сохранения
        goal_data = {
            "title": goal.title,
            "description": goal.description,
            "specific": goal.specific,
            "measurable": goal.measurable,
            "achievable": goal.achievable,
            "relevant": goal.relevant,
            "time_bound": goal.time_bound,
            "priority": goal.priority
        }

        # Сохраняем цель в базе данных
        goal_id = await goals_repo.create_goal(user_id, goal_data)

        # Возвращаем созданную цель с ID
        created_goal = SMARTGoal(
            id=goal_id,
            user_id=user_id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            **goal_data
        )

        logger.info(f"SMART goal created successfully with ID: {goal_id}")
        return created_goal

    except Exception as e:
        logger.error(f"Error in create_smart_goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании цели: {str(e)}"
        )


@router.get("/goals", response_model=List[SMARTGoal])
async def get_user_goals(
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id),
    include_completed: bool = False
):
    """
    Получение всех SMART целей пользователя

    Args:
        include_completed: включать ли выполненные цели в результат
    """
    try:
        logger.info(f"Getting goals for user {user_id}")

        # Получаем цели из базы данных
        goals_data = await goals_repo.get_user_goals(user_id, include_completed)

        # Преобразуем в объекты SMARTGoal
        goals = [SMARTGoal(**goal_data) for goal_data in goals_data]

        logger.info(f"Retrieved {len(goals)} goals for user {user_id}")
        return goals

    except Exception as e:
        logger.error(f"Error in get_user_goals: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении целей: {str(e)}"
        )
