from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union
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
    time_bound: str = Field(..., description="Временные рамки цели")
    priority: int = Field(default=1, ge=1, le=5, description="Приоритет от 1 до 5")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    is_completed: bool = False


class FreeTimeSlot(BaseModel):
    start: datetime
    end: datetime
    duration_minutes: int


class EventDateTime(BaseModel):
    """Модель для времени события в формате Google Calendar"""
    dateTime: Optional[str] = None
    date: Optional[str] = None
    timeZone: Optional[str] = None


class EventAttendee(BaseModel):
    """Модель для участника события"""
    email: str
    displayName: Optional[str] = None
    responseStatus: Optional[str] = None
    organizer: Optional[bool] = None
    self: Optional[bool] = None

    class Config:
        extra = "allow"  # Разрешаем дополнительные поля


class CalendarEvent(BaseModel):
    """Модель события календаря в формате, совместимом с Google Calendar API"""
    id: str
    summary: str
    description: Optional[str] = None
    start: Union[EventDateTime, Dict[str, Any]]
    end: Union[EventDateTime, Dict[str, Any]]
    location: Optional[str] = None
    status: str
    htmlLink: str
    created: str
    updated: str
    creator: Dict[str, Any]
    organizer: Dict[str, Any]
    attendees: Optional[List[Union[EventAttendee, Dict[str, Any]]]] = None
    calendarId: Optional[str] = None  # Делаем поле опциональным
    recurrence: Optional[List[str]] = None
    recurringEventId: Optional[str] = None
    originalStartTime: Optional[Union[EventDateTime, Dict[str, Any]]] = None

    # Дополнительные поля Google Calendar API
    kind: Optional[str] = None
    etag: Optional[str] = None
    iCalUID: Optional[str] = None
    sequence: Optional[int] = None
    transparency: Optional[str] = None
    visibility: Optional[str] = None
    hangoutLink: Optional[str] = None
    conferenceData: Optional[Dict[str, Any]] = None
    reminders: Optional[Dict[str, Any]] = None
    eventType: Optional[str] = None

    class Config:
        extra = "allow"  # Разрешаем дополнительные поля

    @validator('start', 'end', 'originalStartTime', pre=True)
    def validate_datetime_fields(cls, v):
        """Валидатор для полей времени - принимает любой формат"""
        if isinstance(v, dict):
            return v
        return v

    @validator('attendees', pre=True)
    def validate_attendees(cls, v):
        """Валидатор для участников - принимает список объектов"""
        if v is None:
            return None
        if isinstance(v, list):
            return v
        return []


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
    start_time: Optional[str] = None  # Изменено с datetime на str
    end_time: Optional[str] = None    # Изменено с datetime на str
    location: Optional[str] = None    # Добавлено поле location
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
