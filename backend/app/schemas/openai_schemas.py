from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from .event_schemas import CalendarEvent, ScheduleChange, CalendarAnalysisResponse, CalendarAnalysisRequest


class SMARTGoal(BaseModel):
    """SMART цель"""
    title: str
    description: str
    specific: str  # Конкретная
    measurable: str  # Измеримая
    achievable: str  # Достижимая
    relevant: str  # Актуальная
    time_bound: str  # Ограниченная по времени
    deadline: Optional[datetime] = None


class FreeTimeSlot(BaseModel):
    """Свободный временной слот"""
    start_time: datetime
    end_time: datetime
    duration_minutes: int


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
