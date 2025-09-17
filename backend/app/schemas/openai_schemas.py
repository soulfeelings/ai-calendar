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


class GoalAnalysisItem(BaseModel):
    """Анализ отдельного критерия SMART"""
    score: int = Field(..., ge=0, le=100, description="Оценка от 0 до 100")
    feedback: str = Field(..., description="Обратная связь и рекомендации")


class GoalAnalysisDetails(BaseModel):
    """Детальный анализ по всем критериям SMART"""
    specific: GoalAnalysisItem
    measurable: GoalAnalysisItem
    achievable: GoalAnalysisItem
    relevant: GoalAnalysisItem
    time_bound: GoalAnalysisItem


class ImprovedGoal(BaseModel):
    """Улучшенная версия цели"""
    title: str
    description: str


class GoalAnalysisResponse(BaseModel):
    """Ответ анализа цели от ИИ"""
    is_smart: bool = Field(..., description="Соответствует ли цель принципам SMART")
    overall_score: int = Field(..., ge=0, le=100, description="Общий балл цели")
    analysis: GoalAnalysisDetails = Field(..., description="Детальный анализ по критериям")
    suggestions: List[str] = Field(default=[], description="Рекомендации для улучшения")
    improved_goal: Optional[ImprovedGoal] = Field(None, description="Предлагаемая улучшенная версия цели")
