import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, User } from '../services/authService';

interface AuthContextType {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  user: User | null;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const checkAuth = async () => {
    try {
      console.log('AuthContext: Checking auth state...');

      // Быстрая синхронная проверка наличия токенов
      const token = authService.getAccessToken();
      const userInfo = authService.getSavedUserInfo();
      const hasTokens = !!(token && userInfo);
      console.log('AuthContext: Has tokens:', hasTokens);

      if (!hasTokens) {
        console.log('AuthContext: No tokens found, setting authenticated to false');
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Получаем информацию о пользователе из localStorage
      const savedUser = authService.getSavedUserInfo();
      if (savedUser) {
        setUser(savedUser);
      }

      // Асинхронная проверка валидности токенов
      console.log('AuthContext: Checking token validity...');
      const isValidAuth = await authService.isAuthenticatedAsync();
      console.log('AuthContext: Token validity result:', isValidAuth);

      setIsAuthenticated(isValidAuth);

      if (!isValidAuth) {
        setUser(null);
        authService.clearAuthCache();
      }
    } catch (error) {
      console.error('AuthContext: Auth check failed:', error);
      setIsAuthenticated(false);
      setUser(null);
      authService.clearAuthCache();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('AuthContext: Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Слушаем изменения в localStorage для обновления состояния авторизации
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'access_token' || e.key === 'user_info') {
        console.log('AuthContext: Storage change detected, rechecking auth...');
        checkAuth();
      }
    };

    // Слушаем кастомное событие для обновления состояния после логина
    const handleAuthChange = () => {
      console.log('AuthContext: Auth change event received, rechecking...');
      checkAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('authStateChanged', handleAuthChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('authStateChanged', handleAuthChange);
    };
  }, []);

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    user,
    checkAuth,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
