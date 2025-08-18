import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor для добавления токена авторизации
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor для обработки ошибок авторизации
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Пытаемся обновить токен
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          console.log('API Interceptor: Token expired, attempting refresh...');
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          
          const { access_token, refresh_token: newRefreshToken } = response.data;
          localStorage.setItem('access_token', access_token);
          
          // Обновляем refresh токен если получили новый
          if (newRefreshToken) {
            localStorage.setItem('refresh_token', newRefreshToken);
          }

          // Повторяем оригинальный запрос с новым токеном
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          console.log('API Interceptor: Token refreshed successfully, retrying original request...');
          return api(originalRequest);
        } catch (refreshError) {
          console.error('API Interceptor: Token refresh failed:', refreshError);
          console.log('🔴 API Interceptor: Clearing auth data due to refresh failure');
          console.trace('Stack trace for API interceptor clearing tokens');

          // Только при неудачном обновлении токена очищаем данные
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_info');

          // Отправляем событие об изменении авторизации
          window.dispatchEvent(new Event('authStateChanged'));

          // Не делаем автоматический редирект, пусть App.tsx решает
          return Promise.reject(refreshError);
        }
      } else {
        // Нет refresh токена, очищаем данные
        console.log('🔴 API Interceptor: No refresh token found, clearing auth data');
        console.trace('Stack trace for API interceptor clearing tokens (no refresh token)');

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');

        // Отправляем событие об изменении авторизации
        window.dispatchEvent(new Event('authStateChanged'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
