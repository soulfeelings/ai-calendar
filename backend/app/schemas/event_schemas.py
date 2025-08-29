from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Union
from datetime import datetime


class GoogleCalendarDateTime(BaseModel):
    """Модель для времени события Google Calendar"""
    dateTime: Optional[str] = None
    date: Optional[str] = None
    timeZone: Optional[str] = None


class GoogleCalendarAttendee(BaseModel):
    """Модель для участника события Google Calendar"""
    email: str
    displayName: Optional[str] = None
    organizer: Optional[bool] = False
    self: Optional[bool] = False
    responseStatus: Optional[str] = None


class GoogleCalendarPerson(BaseModel):
    """Модель для создателя/организатора события"""
    email: str
    displayName: Optional[str] = None
    self: Optional[bool] = False


class GoogleCalendarConferenceData(BaseModel):
    """Модель для данных конференции"""
    conferenceId: Optional[str] = None
    entryPoints: Optional[List[Dict[str, Any]]] = None
    conferenceSolution: Optional[Dict[str, Any]] = None


class GoogleCalendarReminders(BaseModel):
    """Модель для напоминаний"""
    useDefault: Optional[bool] = True
    overrides: Optional[List[Dict[str, Any]]] = None


class CalendarEvent(BaseModel):
    """Модель события календаря Google с гибкой валидацией"""

    # Обязательные поля
    id: str
    status: str
    htmlLink: str
    created: str
    updated: str
    summary: str

    # Поля времени
    start: GoogleCalendarDateTime
    end: GoogleCalendarDateTime

    # Поля людей
    creator: GoogleCalendarPerson
    organizer: GoogleCalendarPerson

    # Опциональные поля
    kind: Optional[str] = None
    etag: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    transparency: Optional[str] = None
    visibility: Optional[str] = None
    iCalUID: Optional[str] = None
    sequence: Optional[int] = 0
    attendees: Optional[List[GoogleCalendarAttendee]] = None
    hangoutLink: Optional[str] = None
    conferenceData: Optional[GoogleCalendarConferenceData] = None
    reminders: Optional[GoogleCalendarReminders] = None
    recurrence: Optional[List[str]] = None
    eventType: Optional[str] = "default"

    # Поле календаря (добавляем как опциональное)
    calendarId: Optional[str] = None

    class Config:
        # Разрешаем дополнительные поля
        extra = "allow"
        # Используем enum значения
        use_enum_values = True


class CalendarAnalysisRequest(BaseModel):
    """Запрос на анализ календаря"""
    calendar_events: List[CalendarEvent]
    goals: Optional[List[str]] = None
    context: Optional[str] = None

    @validator('calendar_events', pre=True)
    def validate_calendar_events(cls, v):
        """Валидатор для преобразования событий календаря"""
        if isinstance(v, list):
            validated_events = []
            for event in v:
                if isinstance(event, dict):
                    # Добавляем calendarId если его нет
                    if 'calendarId' not in event:
                        event['calendarId'] = 'primary'

                    # Преобразуем поля attendees если они есть
                    if 'attendees' in event and isinstance(event['attendees'], list):
                        validated_attendees = []
                        for attendee in event['attendees']:
                            if isinstance(attendee, dict):
                                validated_attendees.append(attendee)
                            elif isinstance(attendee, str):
                                validated_attendees.append({'email': attendee})
                        event['attendees'] = validated_attendees

                    validated_events.append(event)
                else:
                    validated_events.append(event)
            return validated_events
        return v


class SimplifiedCalendarEvent(BaseModel):
    """Упрощенная модель события для ИИ"""
    id: str
    title: str
    description: Optional[str] = None
    start_time: str
    end_time: str
    location: Optional[str] = None
    attendees: Optional[List[str]] = None
    is_recurring: bool = False


class ScheduleChange(BaseModel):
    """Модель изменения в расписании"""
    id: str
    action: str  # move, reschedule, cancel, create
    title: str
    reason: str
    new_start: Optional[str] = None
    new_end: Optional[str] = None
    priority: Optional[str] = "medium"


class CalendarAnalysisResponse(BaseModel):
    """Ответ анализа календаря"""
    summary: str
    schedule_changes: List[ScheduleChange]
    recommendations: List[str]
    productivity_score: Optional[int] = Field(None, ge=1, le=10)
    goal_alignment: Optional[str] = None
