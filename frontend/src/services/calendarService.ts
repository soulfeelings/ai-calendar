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

// Добавляем новый интерфейс для результата кеша событий
export interface EventsCacheResult {
  events: CalendarEvent[];
  fromCache: boolean;
  requires_authorization?: boolean;
  authorization_url?: string;
  message?: string;
}

class CalendarService {
  /** Получение события по ID */
  async getEvent(eventId: string): Promise<CalendarEvent> {
    try {
      const response = await api.get(`/calendar/event/${eventId}`);
      return response.data as CalendarEvent;
    } catch (error: any) {
      console.error('Error getting calendar event:', error);
      if (error.response?.data?.detail) {
        throw new Error(error.response.data.detail);
      }
      throw new Error('Ошибка при получении события');
    }
  }

  /**
   * Получение событий календаря с поддержкой forcefullsync
   */
  async getEvents(forcefullsync: boolean = false, fullresponse: boolean = true): Promise<CalendarEvent[]> {
    try {
      const params: any = {};

      if (forcefullsync) {
        params.forcefullsync = 'true';
      }

      // НОВОЕ: Добавляем параметр fullresponse для получения полных данных событий
      if (fullresponse) {
        params.fullresponse = 'true';
        console.log('📋 Requesting full calendar events data with fullresponse=true');
      }

      console.log('📤 Calendar API request params:', params);

      const response = await api.get('/calendar/events', { params });

      // Google Calendar API возвращает объект с полем items, извлекаем массив событий
      const data = response.data;

      console.log('📥 Calendar API response structure:', {
        is_array: Array.isArray(data),
        has_items: data && typeof data === 'object' && 'items' in data,
        has_events: data && typeof data === 'object' && 'events' in data,
        data_keys: data && typeof data === 'object' ? Object.keys(data) : 'not_object',
        total_items: Array.isArray(data) ? data.length :
                     (data?.items ? data.items.length :
                      (data?.events ? data.events.length : 'unknown'))
      });

      // Если это объект Google Calendar с полем items
      if (data && typeof data === 'object' && data.items) {
        console.log(`📊 Retrieved ${data.items.length} events from calendar API`);
        return data.items;
      }

      // Если это массив событий напрямую
      if (Array.isArray(data)) {
        console.log(`📊 Retrieved ${data.length} events (direct array)`);
        return data;
      }

      // Если это объект с полем events (fallback)
      if (data && typeof data === 'object' && data.events) {
        console.log(`📊 Retrieved ${data.events.length} events from events field`);
        return data.events;
      }

      console.warn('📋 Unexpected calendar response format:', data);
      return [];
    } catch (error: any) {
      console.error('❌ Error getting calendar events:', error);

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
  async getEventsWithCache(): Promise<EventsCacheResult> {
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

      // Иначе загружаем с сервера через прямой API вызов
      const response = await api.get('/calendar/events', { params: { forcefullsync: 'true' } });
      const data = response.data;

      // Проверяем, требуется ли авторизация календаря
      if (data.requires_authorization && data.authorization_url) {
        return {
          events: [],
          fromCache: false,
          requires_authorization: true,
          authorization_url: data.authorization_url,
          message: data.message
        };
      }

      // Извлекаем события из ответа
      const events = data.items || data.events || data;

      // Проверяем, что events - это массив
      if (!Array.isArray(events)) {
        console.warn('Server response is not an array:', events);
        return {
          events: [],
          fromCache: false
        };
      }

      // Сохран��ем в кеш
      localStorage.setItem('calendar_events', JSON.stringify(events));
      localStorage.setItem('calendar_events_timestamp', Date.now().toString());

      return {
        events,
        fromCache: false
      };
    } catch (error: any) {
      console.error('Error in getEventsWithCache:', error);

      // Проверяем, если ошибка связана с авторизацией календаря
      if (error.response?.data?.requires_authorization && error.response?.data?.authorization_url) {
        return {
          events: [],
          fromCache: false,
          requires_authorization: true,
          authorization_url: error.response.data.authorization_url,
          message: error.response.data.message
        };
      }

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

      // ИСПРАВЛЕНИЕ: Более надежное извлечение событий из ответа
      const responseData = response.data;
      let serverEvents: CalendarEvent[];

      console.log('Response data structure:', responseData);

      // Проверяем различные возможные структуры ответа
      if (responseData && typeof responseData === 'object' && responseData.items && Array.isArray(responseData.items)) {
        serverEvents = responseData.items;
        console.log('Extracted events from items field:', serverEvents.length);
      } else if (Array.isArray(responseData)) {
        serverEvents = responseData;
        console.log('Using response data as array directly:', serverEvents.length);
      } else if (responseData && typeof responseData === 'object' && responseData.events && Array.isArray(responseData.events)) {
        serverEvents = responseData.events;
        console.log('Extracted events from events field:', serverEvents.length);
      } else {
        console.warn('Unexpected response format in checkEventsUpdates:', responseData);
        console.warn('Available fields:', Object.keys(responseData || {}));
        serverEvents = [];
      }

      // Проверяем, что serverEvents теперь массив
      if (!Array.isArray(serverEvents)) {
        console.error('Failed to extract events array from response:', responseData);
        // Пытаем��я вернуть кешированные данные
        const cachedEvents = localStorage.getItem('calendar_events');
        if (cachedEvents) {
          try {
            const cached = JSON.parse(cachedEvents);
            return { hasChanges: false, events: Array.isArray(cached) ? cached : [] };
          } catch (parseError) {
            console.error('Failed to parse cached events:', parseError);
          }
        }
        return { hasChanges: false, events: [] };
      }

      const cachedEvents = localStorage.getItem('calendar_events');

      if (!cachedEvents) {
        // Если кеша нет, считаем что есть изменения
        localStorage.setItem('calendar_events', JSON.stringify(serverEvents));
        localStorage.setItem('calendar_events_timestamp', Date.now().toString());
        return { hasChanges: true, events: serverEvents };
      }

      let cached: CalendarEvent[];
      try {
        cached = JSON.parse(cachedEvents);
      } catch (parseError) {
        console.warn('Failed to parse cached events, treating as no cache:', parseError);
        localStorage.setItem('calendar_events', JSON.stringify(serverEvents));
        localStorage.setItem('calendar_events_timestamp', Date.now().toString());
        return { hasChanges: true, events: serverEvents };
      }

      // Проверяем, что cached - это массив
      if (!Array.isArray(cached)) {
        console.warn('Cached events is not an array:', cached);
        localStorage.setItem('calendar_events', JSON.stringify(serverEvents));
        localStorage.setItem('calendar_events_timestamp', Date.now().toString());
        return { hasChanges: true, events: serverEvents };
      }

      // Простое сравнение по количеству и updated полям
      const hasChanges = serverEvents.length !== cached.length ||
        serverEvents.some((event: CalendarEvent, index: number) => {
          const cachedEvent = cached.find(c => c.id === event.id);
          return !cachedEvent || event.updated !== cachedEvent.updated;
        });

      console.log('Changes check result:', {
        serverCount: serverEvents.length,
        cachedCount: cached.length,
        hasChanges
      });

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
   * Проверка обновлений с полным отве��ом
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
