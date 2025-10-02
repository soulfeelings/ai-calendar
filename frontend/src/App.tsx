import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import GoogleCallback from './components/GoogleCallback';
import CalendarCallback from './components/CalendarCallback';
import Profile from './components/Profile';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';

// Новый компонент для анимированных маршрутов
function AnimatedRoutes() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Проверяем авторизацию...</p>
      </div>
    );
  }

  return (
    <div className="route-transition-wrapper">
      <div key={location.pathname} className="route-fade-in">
        <Routes location={location}>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/profile" replace /> : <Login />}
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
                <Profile activeSection="goals" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              isAuthenticated ? <Navigate to="/profile" replace /> : <Navigate to="/login" replace />
            }
          />
        </Routes>
      </div>
    </div>
  );
}

function AppContent() {
  // Перенесли авторизационную логику внутрь AnimatedRoutes для единого fade-in
  return <AnimatedRoutes />;
}

function App() {
  return (
    <Router>
      <div className="App">
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </div>
    </Router>
  );
}

export default App;
