from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from .event_schemas import CalendarEvent, ScheduleChange, CalendarAnalysisResponse, CalendarAnalysisRequest


class OpenAIMessage(BaseModel):
    """Модель сообщения для OpenAI API"""
    role: str  # system, user, assistant
    content: str


class OpenAIRequest(BaseModel):
    """Запрос к OpenAI API"""
    messages: List[OpenAIMessage]
    model: Optional[str] = "gpt-4"
    max_tokens: Optional[int] = 1000
    temperature: Optional[float] = 0.7
    system_prompt: Optional[str] = None


class OpenAIResponse(BaseModel):
    """Ответ от OpenAI API"""
    content: str
    tokens_used: Optional[int] = None
    model: str
    created: Optional[int] = None


class SMARTGoal(BaseModel):
    """SMART цель"""
    id: Optional[str] = None
    user_id: Optional[str] = None
    title: str
    description: str
    deadline: Optional[datetime] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "active"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Внутренние поля для SMART анализа (не заполняются пользователем)
    smart_analysis: Optional[dict] = None  # Результат SMART анализа от ИИ


class FreeTimeSlot(BaseModel):
    """Свободный временной слот"""
    start_time: datetime
    end_time: datetime
    duration_minutes: int


class ScheduledEvent(BaseModel):
    """Запланированное событие в расписании"""
    title: str
    description: Optional[str] = None
    start_time: str  # ISO 8601 format
    end_time: str    # ISO 8601 format
    priority: Optional[str] = "medium"  # low, medium, high
    category: Optional[str] = None  # work, personal, health, etc.
    goal_id: Optional[str] = None  # связь с целью
    is_flexible: Optional[bool] = True  # можно ли перенести


class DaySchedule(BaseModel):
    """Расписание на один день"""
    date: str  # YYYY-MM-DD format
    day_name: str  # Monday, Tuesday, etc.
    events: List[ScheduledEvent]
    total_productive_hours: Optional[float] = None
    break_time_hours: Optional[float] = None
    summary: Optional[str] = None


class FullScheduleRequest(BaseModel):
    """Запрос на создание полного расписания"""
    schedule_type: str = Field(..., description="'tomorrow' или 'week'")
    user_goals: List[SMARTGoal]
    existing_events: Optional[List[CalendarEvent]] = []
    preferences: Optional[dict] = None  # предпочтения пользователя
    work_hours_start: Optional[str] = "09:00"  # время начала рабочего дня
    work_hours_end: Optional[str] = "18:00"    # время окончания рабочего дня
    break_duration_minutes: Optional[int] = 60  # обеденный перерыв
    buffer_between_events_minutes: Optional[int] = 15  # буфер между событиями


class FullScheduleResponse(BaseModel):
    """Ответ с полным расписанием"""
    schedule_type: str
    schedules: List[DaySchedule]  # расписание по дням
    recommendations: List[str] = []  # общие рекомендации
    total_goals_addressed: int = 0  # количество целей, которые учтены
    productivity_score: Optional[float] = None  # оценка продуктивности (0-10)
    reasoning: Optional[str] = None  # объяснение ИИ


class SchedulePlanningRequest(BaseModel):
    """Запрос на планирование расписания для конкретной цели"""
    goal: SMARTGoal
    free_time_slots: List[FreeTimeSlot]
    context: Optional[str] = None


class SchedulePlanningResponse(BaseModel):
    """Ответ на планирование расписания"""
    suggested_time: str
    duration: str
    frequency: str
    reasoning: str
    suggested_events: Optional[List[dict]] = None


class CalendarAnalysisResponse(BaseModel):
    """Ответ анализа календаря"""
    summary: str
    recommendations: List[str]
    schedule_changes: List[dict]
    productivity_score: Optional[float] = None
    goal_alignment: Optional[str] = None


class GoalAnalysisResponse(BaseModel):
    """Ответ анализа цели по SMART критериям"""
    is_smart: bool
    overall_score: int
    analysis: dict
    suggestions: List[str]
    improved_goal: Optional[dict] = None
