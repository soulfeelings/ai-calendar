from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class EventDateTime(BaseModel):
    """Схема для времени события"""
    dateTime: Optional[str] = None
    date: Optional[str] = None
    timeZone: Optional[str] = None


class EventAttendee(BaseModel):
    """Схема для участника события"""
    email: str
    displayName: Optional[str] = None
    responseStatus: Optional[str] = None  # needsAction, declined, tentative, accepted
    optional: Optional[bool] = None


class EventReminder(BaseModel):
    """Схема для напоминания"""
    method: str  # email, popup
    minutes: int


class EventReminders(BaseModel):
    """Схема для настроек напоминаний"""
    useDefault: Optional[bool] = None
    overrides: Optional[List[EventReminder]] = None


class EventConferenceData(BaseModel):
    """Схема для конференц-данных (Meet, Zoom и т.д.)"""
    createRequest: Optional[Dict[str, Any]] = None
    entryPoints: Optional[List[Dict[str, Any]]] = None


class UpdateEventRequest(BaseModel):
    """Схема для обновления события - все поля опциональные"""
    summary: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    start: Optional[EventDateTime] = None
    end: Optional[EventDateTime] = None
    attendees: Optional[List[EventAttendee]] = None
    reminders: Optional[EventReminders] = None
    transparency: Optional[str] = None  # opaque, transparent
    visibility: Optional[str] = None  # default, public, private, confidential
    status: Optional[str] = None  # confirmed, tentative, cancelled
    colorId: Optional[str] = None
    conferenceData: Optional[EventConferenceData] = None
    recurrence: Optional[List[str]] = None  # RRULE строки для повторяющихся событий
    
    class Config:
        # Исключаем None значения при сериализации
        exclude_none = True


class EventUpdateResponse(BaseModel):
    """Схема ответа после обновления события"""
    status: str
    event_id: str
    updated_fields: List[str]
    message: str


class SmartGoalCreate(BaseModel):
    title: str = Field(..., description="Название цели")
    description: Optional[str] = Field(None, description="Описание цели")
    specific: str = Field(..., description="Конкретность цели")
    measurable: str = Field(..., description="Измеримость цели")
    achievable: str = Field(..., description="Достижимость цели")
    relevant: str = Field(..., description="Релевантность цели")
    time_bound: datetime = Field(..., description="Временные рамки цели")
    priority: int = Field(default=1, ge=1, le=5, description="Приоритет от 1 до 5")


class SmartGoal(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str]
    specific: str
    measurable: str
    achievable: str
    relevant: str
    time_bound: datetime
    priority: int
    created_at: datetime
    updated_at: datetime
    is_completed: bool = False


class RecommendationAction(str, Enum):
    CREATE_EVENT = "create_event"
    UPDATE_EVENT = "update_event"
    DELETE_EVENT = "delete_event"
    RESCHEDULE_EVENT = "reschedule_event"


class EventRecommendation(BaseModel):
    action: RecommendationAction
    event_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    reason: str = Field(..., description="Обоснование рекомендации")


class AIRecommendationResponse(BaseModel):
    recommendations: List[EventRecommendation]
    analysis: str = Field(..., description="Анализ календаря и целей")
    productivity_score: int = Field(ge=1, le=10, description="Оценка продуктивности от 1 до 10")


class RecommendationDecision(BaseModel):
    recommendation_id: str
    action: str  # "accept" or "reject"
    user_comment: Optional[str] = None
