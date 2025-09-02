import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Глобальная переменная для отслеживания процесса обновления токена
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });

  failedQueue = [];
};

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
      if (isRefreshing) {
        // Если уже идет процесс обновления токена, добавляем запрос в очередь
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

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

          // Обрабатываем очередь запросов
          processQueue(null, access_token);

          // Повторяем оригинальный запрос с новым токеном
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          console.log('API Interceptor: Token refreshed successfully, retrying original request...');

          return api(originalRequest);
        } catch (refreshError) {
          console.error('API Interceptor: Token refresh failed:', refreshError);

          // Обрабатываем очередь с ошибкой
          processQueue(refreshError, null);

          console.log('🔴 API Interceptor: Clearing auth data due to refresh failure');

          // Только при неудачном обновлении токена очищаем данные
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_info');

          // Отправляем событие об изменении авторизации
          window.dispatchEvent(new Event('authStateChanged'));

          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        // Нет refresh токена, очищаем данные
        console.log('🔴 API Interceptor: No refresh token found, clearing auth data');

        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');

        // Отправляем событие об изменении авторизации
        window.dispatchEvent(new Event('authStateChanged'));

        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
