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

router = APIRouter(prefix="/ai", tags=["AI Calendar Analysis"])
logger = logging.getLogger(__name__)


@router.post("/analyze-calendar", response_model=CalendarAnalysisResponse)
async def analyze_calendar_and_goals(
    request: CalendarAnalysisRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id),
):
    """
    Анализ календаря пользователя �� его SMART целей

    Этот эндпоинт отправляет данные календаря и цели пользователя в OpenAI,
    получает анализ и рекомендации по оптимизации расписания
    """
    try:
        logger.info(f"Starting calendar analysis for user {user_id}")
        logger.info(f"Received {len(request.calendar_events)} events for analysis")

        # Преобразуем события календаря в словари
        calendar_events_dict = [event.model_dump() for event in request.calendar_events]

        # Преобразуем события в упрощенный формат для AI
        simplified_events = openai_service._convert_calendar_events_for_ai(calendar_events_dict)

        # Вызываем сервис OpenAI для анализа
        ai_response = await openai_service.analyze_calendar_and_goals(
            calendar_events=simplified_events,
            user_goals=request.user_goals,
            analysis_period_days=request.analysis_period_days or 7
        )

        # Нормализуем schedule_changes: допускаем, что ИИ мог вернуть строки
        raw_changes = ai_response.get("schedule_changes", []) or []
        normalized_changes = []
        for ch in raw_changes:
            if isinstance(ch, dict):
                normalized_changes.append(ch)
            elif isinstance(ch, str):
                normalized_changes.append({
                    "action": "optimize",
                    "title": ch,
                    "reason": ch
                })
            else:
                logger.debug(f"Skipping unsupported schedule_change item type: {type(ch)}")

        # Формируем ответ (поддерживаем оба варианта ключей: summary или analysis)
        response = CalendarAnalysisResponse(
            summary=ai_response.get("summary") or ai_response.get("analysis", "Анализ не получен"),
            recommendations=ai_response.get("recommendations", []),
            schedule_changes=normalized_changes,
            goal_alignment=ai_response.get("goal_alignment", "Не определено"),
            productivity_score=ai_response.get("productivity_score")
        )

        logger.info(f"Calendar analysis completed successfully")
        return response

    except Exception as e:
        logger.error(f"Error in calendar analysis: {str(e)}")
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

        logger.info(f"Goal planning completed successfully")
        return response

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
        
        # Создаем цель в базе данных
        goal_id = await goals_repo.create_goal(user_id, goal_data)
        
        return {
            "id": goal_id,
            "message": "Цель создана успешно",
            "smart_analysis": smart_analysis
        }
        
    except Exception as e:
        logger.error(f"Error creating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании цели: {str(e)}"
        )


@router.get("/goals", response_model=List[dict])
async def get_user_goals(
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id),
    include_completed: bool = False
):
    """
    Получение списка целей пользователя
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


@router.put("/goals/{goal_id}", response_model=dict)
async def update_goal(
    goal_id: str,
    goal_data: dict,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Обновление цели с повторным SMART анализом
    """
    try:
        # Если изменились ключевые поля, проводим повторный анализ
        if any(key in goal_data for key in ["title", "description", "deadline"]):
            smart_analysis = await openai_service.analyze_goal_smart(
                title=goal_data.get("title", ""),
                description=goal_data.get("description", ""),
                deadline=goal_data.get("deadline")
            )
            goal_data["smart_analysis"] = smart_analysis
        
        # Обновляем цель в базе данных
        success = await goals_repo.update_goal(goal_id, user_id, goal_data)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Цель не найдена"
            )
        
        return {
            "message": "Цель обновлена успешно",
            "smart_analysis": goal_data.get("smart_analysis")
        }
        
    except Exception as e:
        logger.error(f"Error updating goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении цели: {str(e)}"
        )


@router.delete("/goals/{goal_id}", response_model=dict)
async def delete_goal(
    goal_id: str,
    goals_repo: Annotated[GoalsRepository, Depends(get_goals_repo)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Удаление цели
    """
    try:
        success = await goals_repo.delete_goal(goal_id, user_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Цель не найдена"
            )
        
        return {"message": "Цель удалена успешно"}
        
    except Exception as e:
        logger.error(f"Error deleting goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении цели: {str(e)}"
        )


@router.post("/chat", response_model=OpenAIResponse)
async def chat_with_ai(
    request: OpenAIRequest,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id)
):
    """
    Прямое общение с OpenAI для кастомных запросов

    Позволяет отправить произвольный запрос в OpenAI для получения консул��тации
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


@router.post("/analyze-goal", response_model=GoalAnalysisResponse)
async def analyze_goal(
    goal: SMARTGoal,
    openai_service: Annotated[OpenAIService, Depends(get_openai_service)],
    user_id: str = Depends(get_user_request_id),
):
    """
    Анализ SMART цели с помощью ИИ

    Этот эндпоинт отправляет цель пользователя в OpenAI,
    получает детальный анализ по критериям SMART и предложения по улучшению
    """
    try:
        logger.info(f"Starting goal analysis for user {user_id}")

        # Преобразуем цель в словарь для отправки в ИИ
        goal_dict = goal.model_dump()

        # Вызываем сервис OpenAI для анализа цели
        ai_response = await openai_service.analyze_goal_smart(
            title=goal.title,
            description=goal.description,
            deadline=goal.deadline
        )

        # Формируем ответ с правильной структурой
        response = GoalAnalysisResponse(
            is_smart=ai_response.get("is_smart", False),
            score=ai_response.get("score", 0),
            analysis=ai_response.get("analysis", {}),
            suggestions=ai_response.get("suggestions", []),
            improved_goal=ai_response.get("improved_goal")
        )

        logger.info(f"Goal analysis completed successfully for user {user_id}")
        return response

    except Exception as e:
        logger.error(f"Error in analyze_goal: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при анализе цели: {str(e)}"
        )
