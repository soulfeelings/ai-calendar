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

class CalendarService {
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
}

export const calendarService = new CalendarService();
