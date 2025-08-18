import React, { ReactNode, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/authService';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      // Быстрая синхронная проверка наличия токенов
      const hasTokens = authService.isAuthenticated();

      if (!hasTokens) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      // Асинхронная проверка валидности токенов
      const isValidAuth = await authService.isAuthenticatedAsync();
      setIsAuthenticated(isValidAuth);
    } catch (error) {
      console.error('ProtectedRoute auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Слушаем изменения в авторизации
    const handleAuthChange = () => {
      console.log('ProtectedRoute: Auth change event received, rechecking...');
      checkAuth();
    };

    window.addEventListener('authStateChanged', handleAuthChange);

    return () => {
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

  // Если не авторизован, редиректим на логин
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Если авторизован, показываем защищенный контент
  return <>{children}</>;
};

export default ProtectedRoute;
