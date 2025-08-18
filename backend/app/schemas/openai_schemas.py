from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class SMARTGoal(BaseModel):
    """Модель для SMART цели"""
    id: Optional[str] = None
    user_id: Optional[str] = None
    title: str = Field(..., description="Название цели")
    description: Optional[str] = Field(None, description="Описание цели")
    specific: str = Field(..., description="Конкретность цели")
    measurable: str = Field(..., description="Измеримость цели")
    achievable: str = Field(..., description="Достижимость цели")
    relevant: str = Field(..., description="Релевантность цели")
    time_bound: datetime = Field(..., description="Временные рамки цели")
    priority: int = Field(default=1, ge=1, le=5, description="Приоритет от 1 до 5")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_completed: bool = False


class FreeTimeSlot(BaseModel):
    start: datetime
    end: datetime
    duration_minutes: int


class CalendarEvent(BaseModel):
    id: str
    summary: str
    description: Optional[str] = None
    start: datetime
    end: datetime
    location: Optional[str] = None
    attendees: Optional[List[str]] = None


class CalendarAnalysisRequest(BaseModel):
    """Запрос на анализ календаря"""
    calendar_events: List[CalendarEvent]
    user_goals: List[SMARTGoal]
    analysis_period_days: int = Field(default=7, ge=1, le=30)


class ScheduleChange(BaseModel):
    action: str  # "create", "update", "delete", "reschedule"
    event_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    reason: str


class CalendarAnalysisResponse(BaseModel):
    """Ответ анализа календаря"""
    analysis: str
    recommendations: List[str]
    schedule_changes: List[ScheduleChange]
    goal_alignment: str
    productivity_score: Optional[int] = Field(None, ge=1, le=10)


class SchedulePlanningRequest(BaseModel):
    """Запрос на планирование конкретной цели"""
    goal: SMARTGoal
    free_time_slots: List[FreeTimeSlot]
    context: Optional[str] = None


class SuggestedEvent(BaseModel):
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    priority: int


class SchedulePlanningResponse(BaseModel):
    """Ответ планирования расписания"""
    suggested_time: str
    duration: str
    frequency: str
    reasoning: str
    suggested_events: List[SuggestedEvent]


class OpenAIMessage(BaseModel):
    role: str  # "system", "user", "assistant"
    content: str


class OpenAIRequest(BaseModel):
    """Базовый запрос к OpenAI"""
    messages: List[OpenAIMessage]
    model: str = "gpt-4"
    max_tokens: Optional[int] = 1000
    temperature: Optional[float] = 0.7
    system_prompt: Optional[str] = None


class OpenAIResponse(BaseModel):
    """Ответ от OpenAI API"""
    content: str
    tokens_used: Optional[int] = None
    model: str
    created: Optional[int] = None


class AIRecommendationAction(BaseModel):
    """Действие пользователя по рекомендации ИИ"""
    recommendation_id: str
    action: str  # "accept" or "reject"
    user_comment: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)
