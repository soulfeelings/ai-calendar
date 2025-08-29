import api from './api';

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
    responseStatus?: string;
    organizer?: boolean;
    self?: boolean;
  }>;
  hangoutLink?: string;
  conferenceData?: any;
  reminders?: any;
  recurrence?: string[];
  recurringEventId?: string;  // Добавляем недостающее свойство
  eventType?: string;
  calendarId?: string;
}

export interface CalendarEventsResponse {
  kind?: string;
  etag?: string;
  nextSyncToken?: string;
  items?: CalendarEvent[];
  events?: CalendarEvent[];
  requires_authorization?: boolean;
  authorization_url?: string;
  message?: string;
}

class CalendarService {
  /**
   * Получение событий календаря с поддержкой forcefullsync
   */
  async getEvents(forcefullsync: boolean = false): Promise<CalendarEvent[]> {
    try {
      const params = forcefullsync ? { forcefullsync: 'true' } : {};

      const response = await api.get('/calendar/events', { params });

      // Google Calendar API возвращает объект с полем items, извлекаем массив событий
      const data = response.data;

      // Если это объект Google Calendar с полем items
      if (data && typeof data === 'object' && data.items) {
        return data.items;
      }

      // Если это массив событий напрямую
      if (Array.isArray(data)) {
        return data;
      }

      // Если это объект с полем events (fallback)
      if (data && typeof data === 'object' && data.events) {
        return data.events;
      }

      console.warn('Unexpected response format:', data);
      return [];
    } catch (error: any) {
      console.error('Error getting calendar events:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при получении событий календаря');
    }
  }

  /**
   * Получение списка календарей
   */
  async getCalendars(): Promise<Calendar[]> {
    try {
      const response = await api.get('/calendar/list');
      return response.data.items || [];
    } catch (error: any) {
      console.error('Error getting calendars:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при получении календарей');
    }
  }

  /**
   * Обновление события календаря
   */
  async updateEvent(eventId: string, updateData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    try {
      const response = await api.put(`/calendar/events/${eventId}`, updateData);
      return response.data;
    } catch (error: any) {
      console.error('Error updating calendar event:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при обновлении события');
    }
  }

  /**
   * Создание нового события
   */
  async createEvent(eventData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    try {
      const response = await api.post('/calendar/events', eventData);
      return response.data;
    } catch (error: any) {
      console.error('Error creating calendar event:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при создании события');
    }
  }

  /**
   * Удаление события
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await api.delete(`/calendar/events/${eventId}`);
      return true;
    } catch (error: any) {
      console.error('Error deleting calendar event:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при удалении события');
    }
  }

  /**
   * Очистка кеша событий
   */
  clearEventsCache(): void {
    localStorage.removeItem('calendar_events');
    console.log('Calendar events cache cleared');
  }

  /**
   * Получение событий с кешированием
   */
  async getEventsWithCache(): Promise<{ events: CalendarEvent[]; fromCache: boolean }> {
    try {
      // Проверяем кеш
      const cachedEvents = localStorage.getItem('calendar_events');
      const cacheTimestamp = localStorage.getItem('calendar_events_timestamp');

      // Если кеш свежий (младше 5 минут), используем его
      if (cachedEvents && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp);
        if (cacheAge < 5 * 60 * 1000) { // 5 минут
          return {
            events: JSON.parse(cachedEvents),
            fromCache: true
          };
        }
      }

      // Иначе загружаем с сервера
      const events = await this.getEvents(true);

      // Сохраняем в кеш
      localStorage.setItem('calendar_events', JSON.stringify(events));
      localStorage.setItem('calendar_events_timestamp', Date.now().toString());

      return {
        events,
        fromCache: false
      };
    } catch (error) {
      console.error('Error in getEventsWithCache:', error);

      // В случае ошибки пытаемся вернуть кешированные данные
      const cachedEvents = localStorage.getItem('calendar_events');
      if (cachedEvents) {
        return {
          events: JSON.parse(cachedEvents),
          fromCache: true
        };
      }

      throw error;
    }
  }

  /**
   * Принудительное обновление событий
   */
  async forceRefreshEvents(): Promise<CalendarEvent[]> {
    try {
      // Очищаем кеш
      this.clearEventsCache();

      // Загружаем события с сервера
      const events = await this.getEvents(true);

      // Сохраняем в кеш
      localStorage.setItem('calendar_events', JSON.stringify(events));
      localStorage.setItem('calendar_events_timestamp', Date.now().toString());

      return events;
    } catch (error) {
      console.error('Error in forceRefreshEvents:', error);
      throw error;
    }
  }

  /**
   * Проверка обновлений событий
   */
  async checkEventsUpdates(): Promise<{ hasChanges: boolean; events: CalendarEvent[] }> {
    try {
      const response = await api.get('/calendar/events', {
        params: {
          forcefullsync: 'false',
          fullresponse: 'true'
        }
      });

      const serverEvents = response.data;
      const cachedEvents = localStorage.getItem('calendar_events');

      if (!cachedEvents) {
        // Если кеша нет, считаем что есть изменения
        localStorage.setItem('calendar_events', JSON.stringify(serverEvents));
        localStorage.setItem('calendar_events_timestamp', Date.now().toString());
        return { hasChanges: true, events: serverEvents };
      }

      const cached = JSON.parse(cachedEvents);

      // Простое сравнение по количеству и updated полям
      const hasChanges = serverEvents.length !== cached.length ||
        serverEvents.some((event: CalendarEvent, index: number) =>
          !cached[index] || event.updated !== cached[index].updated
        );

      if (hasChanges) {
        localStorage.setItem('calendar_events', JSON.stringify(serverEvents));
        localStorage.setItem('calendar_events_timestamp', Date.now().toString());
      }

      return { hasChanges, events: serverEvents };
    } catch (error) {
      console.error('Error checking events updates:', error);
      throw error;
    }
  }

  /**
   * Проверка обновлений с полным ответом
   */
  async checkEventsUpdatesWithFullResponse(): Promise<{ hasChanges: boolean; events: CalendarEvent[] }> {
    return this.checkEventsUpdates();
  }

  /**
   * Получение списка календарей (алиас для getCalendars)
   */
  async getCalendarList(): Promise<CalendarListResponse> {
    try {
      const response = await api.get('/calendar/list');
      return response.data;
    } catch (error: any) {
      console.error('Error getting calendar list:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при получении списка календарей');
    }
  }

  /**
   * Получение событий календаря (алиас для getEvents)
   */
  async getCalendarEvents(): Promise<CalendarEventsResponse> {
    try {
      const events = await this.getEvents(false);
      return {
        items: events,
        events: events
      };
    } catch (error: any) {
      console.error('Error getting calendar events:', error);
      throw error;
    }
  }

  /**
   * Отправка кода авторизации календаря
   */
  async sendCalendarCode(code: string): Promise<any> {
    try {
      const response = await api.post('/calendar/code', { code });
      return response.data;
    } catch (error: any) {
      console.error('Error sending calendar code:', error);

      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }

      throw new Error('Ошибка при отправке кода авторизации');
    }
  }

  /**
   * Настройка вебхука если необходимо
   */
  async setupWebhookIfNeeded(): Promise<boolean> {
    try {
      const response = await api.post('/calendar/webhook-setup');
      return response.data.success || true;
    } catch (error: any) {
      console.error('Error setting up webhook:', error);

      // Вебхук не критичен, поэтому не выбрасываем ошибку
      console.warn('Webhook setup failed, but continuing...');
      return false;
    }
  }
}

export const calendarService = new CalendarService();
