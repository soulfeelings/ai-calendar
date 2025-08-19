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
    responseStatus: string;
  }>;
  calendarId: string;
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
}

export const calendarService = new CalendarService();
