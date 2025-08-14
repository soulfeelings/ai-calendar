from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


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
