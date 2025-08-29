import api from './api';

// Интерфейсы для работы с ИИ сервисом
export interface ScheduleChange {
  id: string;
  action: string;
  title: string;
  reason: string;
  new_start?: string;
  new_end?: string;
  priority?: string;
}

export interface CalendarAnalysisResponse {
  summary: string;
  schedule_changes: ScheduleChange[];
  recommendations: string[];
  productivity_score?: number;
  goal_alignment?: string;
}

export interface CalendarAnalysisRequest {
  calendar_events: any[];
  goals?: string[];
  context?: string;
}

class AIService {
  /**
   * Анализ календаря с помощью ИИ
   */
  async analyzeCalendar(events: any[], goals?: string[], context?: string): Promise<CalendarAnalysisResponse> {
    try {
      const requestData: CalendarAnalysisRequest = {
        calendar_events: events.map(event => ({
          ...event,
          // Добавляем calendarId если его нет
          calendarId: event.calendarId || 'primary'
        })),
        goals: goals || [],
        context: context
      };

      console.log('Sending analysis request:', requestData);

      const response = await api.post('/ai/analyze-calendar', requestData);

      console.log('Analysis response:', response.data);

      return response.data;
    } catch (error: any) {
      console.error('Error analyzing calendar:', error);

      // Обрабатываем ошибки валидации Pydantic
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          // Массив ошибок валидации
          const validationErrors = error.response.data.detail
            .map((err: any) => `${err.loc?.join('.')} - ${err.msg}`)
            .join('; ');
          throw new Error(`Ошибки валидации: ${validationErrors}`);
        } else if (typeof error.response.data.detail === 'string') {
          // Строковая ошибка
          throw new Error(error.response.data.detail);
        }
      }

      throw new Error('Ошибка при анализе календаря');
    }
  }

  /**
   * Применение изменения в расписании
   */
  async applyScheduleChange(change: ScheduleChange): Promise<boolean> {
    try {
      const response = await api.post('/ai/apply-schedule-change', change);
      return response.data.success;
    } catch (error) {
      console.error('Error applying schedule change:', error);
      throw new Error('Ошибка при применении изменения');
    }
  }

  /**
   * Получение рекомендаций по планированию
   */
  async getPlanningRecommendations(
    freeSlots: any[],
    goal: any,
    context?: string
  ): Promise<any> {
    try {
      const response = await api.post('/ai/plan-goal', {
        free_time_slots: freeSlots,
        goal: goal,
        context: context
      });

      return response.data;
    } catch (error) {
      console.error('Error getting planning recommendations:', error);
      throw new Error('Ошибка при получении рекомендаций по планированию');
    }
  }

  /**
   * Общение с ИИ в чат-формате
   */
  async chatWithAI(
    messages: Array<{role: string; content: string}>,
    systemPrompt?: string
  ): Promise<string> {
    try {
      const response = await api.post('/ai/chat', {
        messages: messages,
        system_prompt: systemPrompt,
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 1000
      });

      return response.data.content;
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw new Error('Ошибка при общении с ИИ');
    }
  }

  /**
   * Создание SMART цели
   */
  async createSMARTGoal(goal: {
    title: string;
    description: string;
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    time_bound: string;
    deadline?: string;
  }): Promise<any> {
    try {
      const response = await api.post('/ai/goals', goal);
      return response.data;
    } catch (error) {
      console.error('Error creating SMART goal:', error);
      throw new Error('Ошибка при создании цели');
    }
  }

  /**
   * Получение пользовательских целей
   */
  async getUserGoals(includeCompleted: boolean = false): Promise<any[]> {
    try {
      const response = await api.get(`/ai/goals?include_completed=${includeCompleted}`);
      return response.data;
    } catch (error) {
      console.error('Error getting user goals:', error);
      throw new Error('Ошибка при получении целей');
    }
  }
}

export const aiService = new AIService();
