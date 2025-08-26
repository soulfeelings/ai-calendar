import api from './api';
import { eventCacheService } from './eventCacheService';

export interface Calendar {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

export interface CalendarListResponse {
  kind?: string;
  etag?: string;
  nextSyncToken?: string;
  items?: Calendar[];
  // Новые поля для случая когда нужна авторизация
  requires_authorization?: boolean;
  authorization_url?: string;
  message?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  status: string;
  htmlLink: string;
  created: string;
  updated: string;
  creator: {
    email: string;
    displayName?: string;
  };
  organizer: {
    email: string;
    displayName?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
  calendarId: string;
  // Поля для повторяющихся событий
  recurrence?: string[]; // RRULE правила повторения
  recurringEventId?: string; // ID родительского повторяющегося события
  originalStartTime?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
}

export interface CalendarEventsResponse {
  kind?: string;
  etag?: string;
  summary?: string;
  description?: string;
  updated?: string;
  timeZone?: string;
  accessRole?: string;
  defaultReminders?: any[];
  nextSyncToken?: string;
  items?: CalendarEvent[];
  // Для совместимости со старым форматом
  events?: CalendarEvent[];
  totalCount?: number;
}

class CalendarService {
  private static readonly WEBHOOK_KEY = 'calendar_webhook_configured';

  // Проверить, настроен ли уже вебхук
  private isWebhookConfigured(): boolean {
    return localStorage.getItem(CalendarService.WEBHOOK_KEY) === 'true';
  }

  // Отметить вебхук как настроенный
  private markWebhookAsConfigured(): void {
    localStorage.setItem(CalendarService.WEBHOOK_KEY, 'true');
  }

  // Сбросить состояние вебхука (для отладки или переподключения)
  resetWebhookStatus(): void {
    localStorage.removeItem(CalendarService.WEBHOOK_KEY);
  }

  // Получить список календарей пользователя
  async getCalendarList(): Promise<CalendarListResponse> {
    const response = await api.get('/calendar/list');

    // Проверяем, требуется ли авторизация
    if (response.data.requires_authorization) {
      console.log('Calendar authorization required, redirecting...');
      console.log('Authorization URL:', response.data.authorization_url);

      // Редиректим на URL авторизации Google
      window.location.href = response.data.authorization_url;

      // Возвращаем данные, но компонент не будет их обрабатывать из-за редиректа
      return response.data;
    }

    return response.data;
  }

  // Отправить код для получения разрешений на календарь
  async sendCalendarCode(code: string): Promise<void> {
    await api.post('/calendar/code', { code });
  }

  // Получить URL для авторизации календаря
  getCalendarAuthUrl(): string {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    return `${baseUrl}/google/calendar`;
  }

  // Получить события календаря
  async getCalendarEvents(forcefullsync: boolean = false, fullresponse: boolean = false): Promise<CalendarEventsResponse> {
    const params = new URLSearchParams();
    if (forcefullsync) params.append('forcefullsync', 'true');
    if (fullresponse) params.append('fullresponse', 'true');

    const response = await api.get(`/calendar/events?${params.toString()}`);
    return response.data;
  }

  // Настройка подписки на вебхуки
  async setupWebhook(): Promise<void> {
    await api.post('/calendar/webhook-setup');
  }

  // Настройка подписки на вебхуки с проверкой localStorage
  async setupWebhookIfNeeded(): Promise<boolean> {
    if (this.isWebhookConfigured()) {
      console.log('Webhook already configured, skipping setup');
      return false;
    }

    try {
      await this.setupWebhook();
      this.markWebhookAsConfigured();
      console.log('Webhook setup successful and marked as configured');
      return true;
    } catch (error) {
      console.error('Webhook setup failed:', error);
      throw error;
    }
  }

  // Получить события календаря с учетом кеширования
  async getEventsWithCache(): Promise<{
    events: CalendarEvent[];
    fromCache: boolean;
    hasChanges?: boolean;
  }> {
    console.log('Getting events with cache logic...');

    // Проверяем, есть ли валидный кеш
    if (eventCacheService.hasValidCache()) {
      console.log('Valid cache found, returning cached events');
      const cachedEvents = eventCacheService.getEventsFromCache();
      return {
        events: cachedEvents,
        fromCache: true
      };
    }

    console.log('No valid cache, fetching events with full sync');

    // Если кеша нет или он устарел, делаем полную синхронизацию
    const response = await this.getCalendarEvents(true, true);
    const events = response.items || response.events || [];

    // Кешируем полученные события
    eventCacheService.setCachedEvents(events, response.etag);

    return {
      events,
      fromCache: false
    };
  }

  // Проверить обновления событий (без forcefullsync)
  async checkEventsUpdates(): Promise<{
    events: CalendarEvent[];
    hasChanges: boolean;
  }> {
    console.log('Checking for events updates...');

    // Запрашиваем только изменения (без forcefullsync)
    const response = await this.getCalendarEvents(false, false);

    // Сравниваем с кешем и обновляем при необходимости
    const result = eventCacheService.updateEventsCache(response);

    console.log('Update check result:', {
      hasChanges: result.hasChanges,
      eventsCount: result.updatedEvents.length
    });

    return {
      events: result.updatedEvents,
      hasChanges: result.hasChanges
    };
  }

  // Проверить обновления с полным ответом (для переходов между вкладками)
  async checkEventsUpdatesWithFullResponse(): Promise<{
    events: CalendarEvent[];
    hasChanges: boolean;
  }> {
    console.log('Checking for events updates with full response...');

    // Запрашиваем с fullresponse=true для получения всех событий
    const response = await this.getCalendarEvents(false, true);
    const events = response.items || response.events || [];

    // Получаем текущий кеш для сравнения
    const cachedEvents = eventCacheService.getEventsFromCache();
    const hasChanges = events.length !== cachedEvents.length ||
                      eventCacheService.compareEvents(cachedEvents, events);

    // Обновляем кеш полученными событиями
    eventCacheService.setCachedEvents(events, response.etag);

    console.log('Full response update result:', {
      hasChanges,
      eventsCount: events.length,
      previousCount: cachedEvents.length
    });

    return {
      events,
      hasChanges
    };
  }

  // Принудительно обновить кеш событий
  async forceRefreshEvents(): Promise<CalendarEvent[]> {
    console.log('Force refreshing events...');

    const response = await this.getCalendarEvents(true, true);
    const events = response.items || response.events || [];

    eventCacheService.setCachedEvents(events, response.etag);

    return events;
  }

  // Получить информацию о состоянии кеша
  getCacheInfo() {
    return eventCacheService.getCacheInfo();
  }

  // Очистить кеш событий
  clearEventsCache(): void {
    eventCacheService.clearCache();
  }
}

export const calendarService = new CalendarService();
