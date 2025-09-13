import api from './api';
import cacheService from './cacheService';

// Интерфейсы для работы с ИИ сервисом
export interface RecurrenceSuggestion {
  rrule?: string;           // например: FREQ=WEEKLY;BYDAY=MO,WE
  days_of_week?: string[];  // MO,TU,WE,TH,FR,SA,SU
  frequency?: string;       // daily|weekly|monthly|yearly
  interval?: number;        // шаг повторения
  until?: string;           // ISO 8601
}

export interface ScheduleChange {
  id: string;
  action: string;
  title: string;
  reason: string;
  new_start?: string;
  new_end?: string;
  priority?: string;
  recurrence?: RecurrenceSuggestion; // НЕОБЯЗАТЕЛЬНО: предложение по повторяемости
}

export interface CalendarAnalysis {
  summary: string;
  schedule_changes: ScheduleChange[];
  recommendations: string[];
  productivity_score?: number;
  goal_alignment?: string;
}

export interface SmartGoal {
  id?: string;
  title: string;
  description: string;
  deadline?: string;
  priority?: string | number;
  status?: string;
  smart_analysis?: any; // Результат SMART анализа от ИИ
}

export interface CalendarAnalysisRequest {
  calendar_events: any[];
  user_goals?: SmartGoal[];
  analysis_period_days?: number;
  goals?: string[];
  context?: string;
}

export interface GoalAnalysis {
  is_smart: boolean;
  score: number; // от 0 до 100
  analysis: {
    specific: { score: number; feedback: string };
    measurable: { score: number; feedback: string };
    achievable: { score: number; feedback: string };
    relevant: { score: number; feedback: string };
    time_bound: { score: number; feedback: string };
  };
  suggestions: string[];
  improved_goal?: {
    title: string;
    description: string;
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    time_bound: string;
  };
}

// Новые интерфейсы для работы с асинхронными задачами
export interface TaskResponse {
  task_id: string;
  status: string;
  message: string;
  user_id: string;
}

export interface TaskStatus {
  task_id: string;
  state: 'PENDING' | 'PROGRESS' | 'SUCCESS' | 'FAILURE';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  progress?: number;
  result?: any;
  error?: string;
}

class AIService {
  private readonly AI_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
  private readonly POLLING_INTERVAL = 2000; // 2 секунды
  private readonly MAX_POLLING_TIME = 300000; // 5 минут максимум

  /**
   * Анализ календаря с помощью ИИ (асинхронно через Celery)
   */
  async analyzeCalendarAsync(
    requestData: CalendarAnalysisRequest,
    forceRefresh: boolean = false,
    onProgress?: (status: TaskStatus) => void
  ): Promise<CalendarAnalysis> {
    try {
      // Проверяем кеш, если не требуется принудительное обновление
      if (!forceRefresh) {
        const cachedResult = cacheService.getByData<CalendarAnalysis>(requestData);
        if (cachedResult) {
          console.log('📋 Using cached AI analysis');
          return cachedResult;
        }
      }

      console.log('🤖 Starting async AI analysis...');
      console.log('Sending analysis request:', requestData);

      // 1. Запускаем задачу
      const taskResponse = await api.post('/ai/analyze-calendar', requestData);
      const taskId = taskResponse.data.task_id;

      console.log('📋 Analysis task started:', taskId);

      // 2. Ждем выполнения задачи с периодическими проверками
      const result = await this.pollTaskStatus(taskId, onProgress);

      // 3. Кешируем результат
      if (result.analysis) {
        cacheService.setByData(requestData, result.analysis, this.AI_CACHE_TTL);
        return result.analysis;
      }

      throw new Error('Анализ завершился без результата');

    } catch (error: any) {
      console.error('Error analyzing calendar:', error);
      throw this.handleAPIError(error, 'Ошибка при анализе календаря');
    }
  }

  /**
   * Синхронный анализ календаря (для быстрых случаев)
   */
  async analyzeCalendarSync(
    requestData: CalendarAnalysisRequest,
    forceRefresh: boolean = false
  ): Promise<CalendarAnalysis> {
    try {
      // Проверяем кеш
      if (!forceRefresh) {
        const cachedResult = cacheService.getByData<CalendarAnalysis>(requestData);
        if (cachedResult) {
          console.log('📋 Using cached AI analysis');
          return cachedResult;
        }
      }

      console.log('🤖 Requesting sync AI analysis...');
      const response = await api.post('/ai/analyze-calendar-sync', requestData);

      // Кешируем результат
      cacheService.setByData(requestData, response.data, this.AI_CACHE_TTL);

      return response.data;
    } catch (error: any) {
      console.error('Error in sync calendar analysis:', error);
      throw this.handleAPIError(error, 'Ошибка при синхронном анализе календаря');
    }
  }

  /**
   * Планирование расписания для цели (асинхронно)
   */
  async planGoalAsync(
    requestData: any,
    onProgress?: (status: TaskStatus) => void
  ): Promise<any> {
    try {
      console.log('🎯 Starting async goal planning...');

      // 1. Запускаем задачу
      const taskResponse = await api.post('/ai/plan-goal', requestData);
      const taskId = taskResponse.data.task_id;

      console.log('📋 Goal planning task started:', taskId);

      // 2. Ждем выполнения
      const result = await this.pollTaskStatus(taskId, onProgress);

      return result.suggestion || result;

    } catch (error: any) {
      console.error('Error planning goal:', error);
      throw this.handleAPIError(error, 'Ошибка при планировании цели');
    }
  }

  /**
   * Синхронное планирование цели
   */
  async planGoalSync(requestData: any): Promise<any> {
    try {
      console.log('🎯 Requesting sync goal planning...');
      const response = await api.post('/ai/plan-goal-sync', requestData);
      return response.data;
    } catch (error: any) {
      console.error('Error in sync goal planning:', error);
      throw this.handleAPIError(error, 'Ошибка при синхронном планировании цели');
    }
  }

  /**
   * Получение статуса задачи
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    try {
      const response = await api.get(`/ai/task/${taskId}`);
      return response.data;
    } catch (error: any) {
      console.error('Error getting task status:', error);
      throw this.handleAPIError(error, 'Ошибка при получении статуса задачи');
    }
  }

  /**
   * Polling задачи до завершения
   */
  private async pollTaskStatus(
    taskId: string,
    onProgress?: (status: TaskStatus) => void
  ): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.MAX_POLLING_TIME) {
      try {
        const status = await this.getTaskStatus(taskId);

        // Вызываем callback для обновления UI
        if (onProgress) {
          onProgress(status);
        }

        console.log('📋 Task status:', status.state, status.message);

        if (status.state === 'SUCCESS') {
          return status.result;
        } else if (status.state === 'FAILURE') {
          throw new Error(status.error || 'Задача завершилась с ошибкой');
        }

        // Ждем перед следующей проверкой
        await new Promise(resolve => setTimeout(resolve, this.POLLING_INTERVAL));

      } catch (error) {
        console.error('Error polling task status:', error);
        // Не бросаем ошибку сразу, пробуем еще раз
        await new Promise(resolve => setTimeout(resolve, this.POLLING_INTERVAL));
      }
    }

    throw new Error('Время ожидания задачи истекло');
  }

  /**
   * Обработка ошибок API
   */
  private handleAPIError(error: any, defaultMessage: string): Error {
    if (error.response?.data?.detail) {
      if (Array.isArray(error.response.data.detail)) {
        // Массив ошибок валидации
        const validationErrors = error.response.data.detail
          .map((err: any) => `${err.loc?.join('.')} - ${err.msg}`)
          .join('; ');
        return new Error(`Ошибки валидации: ${validationErrors}`);
      } else if (typeof error.response.data.detail === 'string') {
        // Строковая ошибка
        return new Error(error.response.data.detail);
      }
    }
    return new Error(defaultMessage);
  }

  /**
   * Основной метод анализа календаря (выбирает async/sync автоматически)
   */
  async analyzeCalendar(
    requestData: CalendarAnalysisRequest,
    forceRefresh: boolean = false,
    useAsync: boolean = true,
    onProgress?: (status: TaskStatus) => void
  ): Promise<CalendarAnalysis> {
    if (useAsync) {
      return this.analyzeCalendarAsync(requestData, forceRefresh, onProgress);
    } else {
      return this.analyzeCalendarSync(requestData, forceRefresh);
    }
  }

  /**
   * Очистка кеша ИИ
   */
  clearAICache(): void {
    cacheService.clearAICache();
  }

  /**
   * Получение информации о кеше ИИ
   */
  getCacheInfo() {
    return cacheService.getCacheInfo();
  }

  /**
   * Получение целей пользователя
   */
  async getGoals(includeCompleted: boolean = false): Promise<SmartGoal[]> {
    try {
      const response = await api.get(`/ai/goals?include_completed=${includeCompleted}`);
      return response.data;
    } catch (error) {
      console.error('Error getting user goals:', error);
      throw new Error('Ошибка при получении целей');
    }
  }

  /**
   * Обновление события календаря
   */
  async updateCalendarEvent(eventId: string, updateData: any): Promise<any> {
    try {
      // Backend использует PATCH /calendar/event/{event_id}
      const response = await api.patch(`/calendar/event/${eventId}`, updateData);
      return response.data;
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw new Error('Ошибка при обновлении события');
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
  async createSMARTGoal(goal: SmartGoal): Promise<SmartGoal> {
    try {
      const response = await api.post('/ai/goals', goal);
      return response.data;
    } catch (error) {
      console.error('Error creating SMART goal:', error);
      throw new Error('Ошибка при создании цели');
    }
  }

  /**
   * Анализ цели с помощью ИИ
   */
  async analyzeGoal(goal: SmartGoal): Promise<GoalAnalysis> {
    try {
      const response = await api.post('/ai/analyze-goal', goal);
      return response.data;
    } catch (error) {
      console.error('Error analyzing goal:', error);
      throw new Error('Ошибка при анализе цели');
    }
  }
}

export const aiService = new AIService();
