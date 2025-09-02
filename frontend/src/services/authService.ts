import api from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user_info: User;
}

class AuthService {
  private tokenRefreshPromise: Promise<boolean> | null = null;
  private authCheckPromise: Promise<boolean> | null = null;
  private lastAuthCheck: number = 0;
  private authCheckCacheTime: number = 5000; // 5 секунд кэша
  private lastAuthResult: boolean = false;

  // Получить URL для Google OAuth авторизации
  getGoogleAuthUrl(): string {
    return `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/google/`;
  }

  // Обработка callback от Google OAuth
  async handleGoogleCallback(code: string): Promise<AuthResponse> {
    console.log('AuthService: Sending callback request to backend');
    console.log('API URL:', `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/google/callback`);
    console.log('Payload:', { code });

    const response = await api.post('/google/callback', { code });
    const authData = response.data;

    console.log('AuthService: Response received:', authData);

    // Сохраняем токены с дополнительной проверкой
    if (authData.access_token) {
      localStorage.setItem('access_token', authData.access_token);
      console.log('AuthService: Access token saved');
    }

    if (authData.refresh_token) {
      localStorage.setItem('refresh_token', authData.refresh_token);
      console.log('AuthService: Refresh token saved');
    }

    // Если user_info не пришел в ответе, получаем его отдельным запросом
    let userInfo = authData.user_info;
    if (!userInfo) {
      console.log('AuthService: User info not in response, fetching separately...');
      try {
        userInfo = await this.getCurrentUser();
        console.log('AuthService: User info fetched separately:', userInfo);
      } catch (error) {
        console.error('AuthService: Failed to fetch user info:', error);
        throw new Error('Не удалось получить информацию о пользователе');
      }
    }

    // Сохраняем информацию о пользователе с проверкой
    if (userInfo) {
      localStorage.setItem('user_info', JSON.stringify(userInfo));
      console.log('AuthService: User info saved');

      // Дополнительная проверка сохранения
      const saved = localStorage.getItem('user_info');
      if (!saved) {
        console.error('AuthService: Failed to save user_info to localStorage!');
      } else {
        console.log('AuthService: User info save verified');
      }
    }

    // Финальная проверка всех данных
    console.log('AuthService: Final verification:');
    console.log('- access_token saved:', !!localStorage.getItem('access_token'));
    console.log('- refresh_token saved:', !!localStorage.getItem('refresh_token'));
    console.log('- user_info saved:', !!localStorage.getItem('user_info'));

    // Отправляем кастомное событие для обновления состояния в App
    window.dispatchEvent(new Event('authStateChanged'));

    return {
      access_token: authData.access_token,
      refresh_token: authData.refresh_token,
      user_info: userInfo
    };
  }

  // Получить информацию о текущем пользователе
  async getCurrentUser(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data;
  }

  // Получить токен до��тупа
  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  // Получить refresh токен
  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  // Обновить access токен используя refresh токен
  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      console.warn('No refresh token found');
      return false;
    }

    try {
      console.log('Attempting to refresh access token...');
      const response = await api.post('/auth/refresh', {
        refresh_token: refreshToken
      });

      const { access_token, refresh_token: newRefreshToken } = response.data;
      
      // Сохраняем новые токены
      localStorage.setItem('access_token', access_token);
      if (newRefreshToken) {
        localStorage.setItem('refresh_token', newRefreshToken);
      }

      console.log('Access token refreshed successfully');
      return true;
    } catch (error: any) {
      console.error('Failed to refresh access token:', error);
      console.error('Refresh error status:', error.response?.status);
      console.error('Refresh error data:', error.response?.data);

      // Не очищаем данные автоматически, пусть App.tsx решает
      return false;
    }
  }

  // Проверить и при необходимости обновить токен
  async ensureValidToken(): Promise<boolean> {
    // Если уже идет процесс обновления токена, ждем его завершения
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    const accessToken = this.getAccessToken();
    if (!accessToken) {
      return false;
    }

    try {
      // Проверяем валидность текущего токена
      const isValid = await this.validateToken();
      if (isValid) {
        return true;
      }

      // Если токен невалиден, пытаемся обновить
      console.log('Access token is invalid, attempting refresh...');
      this.tokenRefreshPromise = this.refreshAccessToken();
      const refreshResult = await this.tokenRefreshPromise;
      this.tokenRefreshPromise = null;
      
      return refreshResult;
    } catch (error) {
      console.error('Error ensuring valid token:', error);
      this.tokenRefreshPromise = null;
      return false;
    }
  }

  // Проверить валидность токена
  async validateToken(): Promise<boolean> {
    try {
      const response = await api.get('/auth/validate');
      return response.status === 200;
    } catch (error: any) {
      // Если токен истек (401), это нормально
      if (error.response?.status === 401) {
        console.log('Token expired, needs refresh');
        return false;
      }
      console.error('Token validation error:', error);
      return false;
    }
  }

  // Улучшенная проверка авторизации с кэшированием
  async isAuthenticatedAsync(): Promise<boolean> {
    console.log('AuthService.isAuthenticatedAsync() called');

    // Проверяем кэш (если проверка была недавно)
    const now = Date.now();
    if (now - this.lastAuthCheck < this.authCheckCacheTime) {
      console.log('AuthService.isAuthenticatedAsync() - returning cached result:', this.lastAuthResult);
      return this.lastAuthResult;
    }

    // Если уже идет проверка авторизации, возвращаем существующий Promise
    if (this.authCheckPromise) {
      console.log('AuthService.isAuthenticatedAsync() - auth check in progress, waiting...');
      return this.authCheckPromise;
    }

    // Создаем новый Promise для проверки авторизации
    this.authCheckPromise = this.performAuthCheck();
    const result = await this.authCheckPromise;

    // Сохраняем результат в кэш
    this.lastAuthCheck = now;
    this.lastAuthResult = result;
    this.authCheckPromise = null;

    return result;
  }

  private async performAuthCheck(): Promise<boolean> {
    const token = this.getAccessToken();
    const userInfo = this.getSavedUserInfo();

    console.log('AuthService.performAuthCheck() - token exists:', !!token);
    console.log('AuthService.performAuthCheck() - userInfo exists:', !!userInfo);

    if (!token || !userInfo) {
      console.log('AuthService.performAuthCheck() - missing token or userInfo, returning false');
      return false;
    }

    // Проверяем и обновляем токен при необходимости
    const isValid = await this.ensureValidToken();
    console.log('AuthService.performAuthCheck() - token validity:', isValid);
    return isValid;
  }

  // Синхронная проверка авторизации (для начальной загрузки)
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    const userInfo = this.getSavedUserInfo();

    console.log('AuthService.isAuthenticated() check:');
    console.log('- Access token:', token ? 'exists' : 'missing');
    console.log('- User info:', userInfo ? 'exists' : 'missing');
    console.log('- localStorage access_token:', localStorage.getItem('access_token'));
    console.log('- localStorage user_info:', localStorage.getItem('user_info'));

    return !!(token && userInfo);
  }

  // Очистка кэша при изменении состояни�� авторизации
  clearAuthCache(): void {
    this.lastAuthCheck = 0;
    this.lastAuthResult = false;
    this.authCheckPromise = null;
  }

  // Выход из системы
  async logout(): Promise<void> {
    console.log('🔴 AuthService.logout() called!');
    console.trace('Stack trace for logout call');

    this.clearAuthCache(); // Очищаем кэш

    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Очищаем localStorage в любом случае
      console.log('🔴 Removing tokens from localStorage...');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_info');
      localStorage.removeItem("calendar_webhook_configured")
    }
  }

  // Получить сохраненную информацию о пользователе
  getSavedUserInfo(): User | null {
    try {
      const userInfo = localStorage.getItem('user_info');
      console.log('AuthService.getSavedUserInfo():');
      console.log('- Raw user_info from localStorage:', userInfo);

      if (!userInfo || userInfo.trim() === '') {
        console.warn('No user info found in localStorage');
        return null;
      }

      const parsed = JSON.parse(userInfo);
      console.log('- Parsed user info:', parsed);
      return parsed;
    } catch (error) {
      console.error('Error parsing user info from localStorage:', error);
      // Очищаем поврежденные данные
      localStorage.removeItem('user_info');
      return null;
    }
  }
}

export const authService = new AuthService();
