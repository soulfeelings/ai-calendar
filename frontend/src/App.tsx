import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import GoogleCallback from './components/GoogleCallback';
import CalendarCallback from './components/CalendarCallback';
import Profile from './components/Profile';
import ProtectedRoute from './components/ProtectedRoute';
import { authService } from './services/authService';
import './App.css';
import Goals from './components/Goals';

// Компонент для безопасного редиректа
const SafeRedirect: React.FC<{ to: string }> = ({ to }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(to, { replace: true });
    }, 0);

    return () => clearTimeout(timer);
  }, [navigate, to]);

  return (
    <div className="app-loading">
      <div className="spinner"></div>
      <p>Перенаправление...</p>
    </div>
  );
};

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Логируем состояние localStorage при загрузке компонента
  useEffect(() => {
    console.log('=== APP STARTUP - CHECKING LOCALSTORAGE ===');
    console.log('localStorage access_token:', localStorage.getItem('access_token'));
    console.log('localStorage refresh_token:', localStorage.getItem('refresh_token'));
    console.log('localStorage user_info:', localStorage.getItem('user_info'));
    console.log('localStorage length:', localStorage.length);

    // Проверяем все ключи localStorage
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
    console.log('All localStorage keys:', keys);

    // Проверяем настройки браузера
    console.log('Browser info:');
    console.log('- Cookie enabled:', navigator.cookieEnabled);
    console.log('- Storage quota:', navigator?.storage ? 'available' : 'not available');
    console.log('- User agent:', navigator.userAgent);

    console.log('=== END STARTUP CHECK ===');
  }, []);

  const checkAuth = async () => {
    try {
      console.log('App.tsx: Checking auth state...');
      // Быстрая синхронная проверка наличия токенов
      const hasTokens = authService.isAuthenticated();
      console.log('App.tsx: Has tokens:', hasTokens);

      if (!hasTokens) {
        console.log('App.tsx: No tokens found, setting authenticated to false');
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      // Асинхронная проверка валидности токенов
      console.log('App.tsx: Checking token validity...');
      const isValidAuth = await authService.isAuthenticatedAsync();
      console.log('App.tsx: Token validity result:', isValidAuth);
      setIsAuthenticated(isValidAuth);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Слушаем изменения в localStorage для обновления состояния авторизации
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'access_token' || e.key === 'user_info') {
        console.log('Auth state changed, rechecking...');
        checkAuth();
      }
    };

    // Слушаем кастомное событие для обновления состояния после логина
    const handleAuthChange = () => {
      console.log('Auth change event received, rechecking...');
      checkAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('authStateChanged', handleAuthChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('authStateChanged', handleAuthChange);
    };
  }, []);

  // Показываем загрузчик пока проверяем авторизацию
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Проверяем авторизацию...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <SafeRedirect to="/profile" /> : <Login />}
      />
      <Route path="/auth/callback" element={<GoogleCallback />} />
      <Route path="/calendar/callback" element={<CalendarCallback />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <Profile activeSection="events" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recommendations"
        element={
          <ProtectedRoute>
            <Profile activeSection="recommendations" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <Goals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          isAuthenticated ? <SafeRedirect to="/profile" /> : <SafeRedirect to="/login" />
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <AppContent />
      </div>
    </Router>
  );
}

export default App;
