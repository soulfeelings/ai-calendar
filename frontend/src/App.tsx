import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import GoogleCallback from './components/GoogleCallback';
import CalendarCallback from './components/CalendarCallback';
import Profile from './components/Profile';
import ProtectedRoute from './components/ProtectedRoute';
import { authService } from './services/authService';
import './App.css';

function App() {
  const isAuthenticated = authService.isAuthenticated();

  return (
    <Router>
      <div className="App">
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
            path="/"
            element={<Navigate to={isAuthenticated ? "/profile" : "/login"} replace />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
