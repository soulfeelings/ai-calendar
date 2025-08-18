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

    // Сохраняем токены и информацию о пользователе
    localStorage.setItem('access_token', authData.access_token);
    localStorage.setItem('refresh_token', authData.refresh_token);
    localStorage.setItem('user_info', JSON.stringify(authData.user_info));

    console.log('AuthService: Tokens saved to localStorage');

    return authData;
  }

  // Получить информацию о текущем пользователе
  async getCurrentUser(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data;
  }

  // Проверить валидность токена
  async validateToken(): Promise<boolean> {
    try {
      const response = await api.get('/auth/validate');
      return response.data;
    } catch {
      return false;
    }
  }

  // Выход из системы
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Очищаем localStorage в любом случае
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_info');
    }
  }

  // Проверить, авторизован ли пользователь
  isAuthenticated(): boolean {
    const token = localStorage.getItem('access_token');
    const userInfo = localStorage.getItem('user_info');
    return !!(token && userInfo);
  }

  // Получить сохраненную информацию о пользователе
  getSavedUserInfo(): User | null {
    try {
      const userInfo = localStorage.getItem('user_info');
      if (!userInfo || userInfo.trim() === '') {
        console.warn('No user info found in localStorage');
        return null;
      }
      return JSON.parse(userInfo);
    } catch (error) {
      console.error('Error parsing user info from localStorage:', error);
      // Очищаем поврежденные данные
      localStorage.removeItem('user_info');
      return null;
    }
  }
}

export const authService = new AuthService();
