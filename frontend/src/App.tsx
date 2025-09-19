import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import GoogleCallback from './components/GoogleCallback';
import CalendarCallback from './components/CalendarCallback';
import Profile from './components/Profile';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';
import Goals from './components/Goals';

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

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
            <Goals />
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
  );
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
