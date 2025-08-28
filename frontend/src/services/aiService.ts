import api from './api';
import { CalendarEvent } from './calendarService';

export interface SmartGoal {
  id?: string;
  user_id?: string;
  title: string;
  description?: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  time_bound: string;
  priority: number;
  created_at?: string;
  updated_at?: string;
  is_completed?: boolean;
}

export interface ScheduleChange {
  action: 'create' | 'update' | 'delete';
  event_id?: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  location?: string;
  reason: string;
}

export interface CalendarAnalysis {
  analysis: string;
  recommendations: string[];
  schedule_changes: ScheduleChange[];
  goal_alignment: string;
  productivity_score: number;
}

export interface AnalyzeCalendarRequest {
  calendar_events: CalendarEvent[];
  user_goals: SmartGoal[];
  analysis_period_days?: number;
}

export interface CreateGoalRequest {
  title: string;
  description?: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  time_bound: string;
  priority: number;
}

export interface PlanGoalRequest {
  goal: SmartGoal;
  free_time_slots: Array<{
    start: string;
    end: string;
    duration_minutes: number;
  }>;
  context?: string;
}

export interface GoalPlan {
  suggested_time: string;
  duration: string;
  frequency: string;
  reasoning: string;
  suggested_events: Array<{
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    priority: number;
  }>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  tokens_used: number;
  model: string;
  created: number;
}

class AIService {
  // Анализ календаря и получение рекомендаций
  async analyzeCalendar(request: AnalyzeCalendarRequest): Promise<CalendarAnalysis> {
    const response = await api.post('/ai/analyze-calendar', request);
    return response.data;
  }

  // Получение всех SMART целей
  async getGoals(includeCompleted: boolean = false): Promise<SmartGoal[]> {
    const response = await api.get('/ai/goals', {
      params: { include_completed: includeCompleted }
    });
    return response.data;
  }

  // Создание новой SMART цели
  async createGoal(goal: CreateGoalRequest): Promise<SmartGoal> {
    const response = await api.post('/ai/goals', goal);
    return response.data;
  }

  // Планирование расписания для цели
  async planGoal(request: PlanGoalRequest): Promise<GoalPlan> {
    const response = await api.post('/ai/plan-goal', request);
    return response.data;
  }

  // Чат с AI
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await api.post('/ai/chat', request);
    return response.data;
  }

  // Обновление события календаря
  async updateCalendarEvent(eventId: string, updateData: Partial<CalendarEvent>): Promise<any> {
    const response = await api.patch(`/calendar/event/${eventId}`, updateData);
    return response.data;
  }

  // Массовое обновление событий
  async bulkUpdateEvents(updates: Array<{ event_id: string; update_data: Partial<CalendarEvent> }>): Promise<any[]> {
    const response = await api.patch('/calendar/events/bulk', updates);
    return response.data;
  }
}

export const aiService = new AIService();
