import React, { useEffect, useState } from 'react';
import { authService, User } from '../services/authService';
import { calendarService, Calendar } from '../services/calendarService';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

type ActiveSection = 'calendar' | 'events' | 'recommendations';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('calendar');

  useEffect(() => {
    const loadUserAndCalendars = async () => {
      try {
        // Загружаем информацию о пользователе
        let userInfo = authService.getSavedUserInfo();

        if (!userInfo) {
          console.log('No user info in localStorage, fetching from server...');
          userInfo = await authService.getCurrentUser();
          localStorage.setItem('user_info', JSON.stringify(userInfo));
        }

        setUser(userInfo);

        // Пытаемся загрузить список календарей
        await loadCalendars();

      } catch (error) {
        console.error('Error loading user info:', error);
        await authService.logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    loadUserAndCalendars();
  }, [navigate]);

  const loadCalendars = async () => {
    try {
      setCalendarLoading(true);
      setError(null);
      console.log('Attempting to load calendars...');

      const response = await calendarService.getCalendarList();

      // Если есть items, значит авторизация прошла успешно
      if (response.items) {
        setCalendars(response.items);
        console.log('Calendars loaded successfully:', response.items);
      }

    } catch (error: any) {
      console.error('Error loading calendars:', error);
      setError('Ошибка при загрузке календарей');
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'calendar':
        return (
          <div className="calendar-section">
            <div className="section-header">
              <h2>Google Календарь</h2>
              <button
                onClick={loadCalendars}
                className="refresh-button"
                disabled={calendarLoading}
              >
                {calendarLoading ? 'Загрузка...' : 'Обновить'}
              </button>
            </div>

            {error && (
              <div className="error-banner">
                <p>{error}</p>
              </div>
            )}

            {calendarLoading && (
              <div className="calendar-loading">
                <div className="spinner small"></div>
                <p>Загружаем календари...</p>
              </div>
            )}

            {calendars.length > 0 && (
              <div className="calendars-list">
                <h3>Ваши календари:</h3>
                {calendars.map((calendar) => (
                  <div key={calendar.id} className="calendar-item">
                    <div className="calendar-info">
                      <h4>{calendar.summary}</h4>
                      <span className={`calendar-role ${calendar.primary ? 'primary' : ''}`}>
                        {calendar.primary ? 'Основной' : calendar.accessRole}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {calendars.length === 0 && !calendarLoading && !error && (
              <div className="no-calendars">
                <p>Календари не найдены</p>
              </div>
            )}
          </div>
        );

      case 'events':
        return (
          <div className="events-section">
            <h2>События календаря</h2>
            <div className="coming-soon">
              <p>🗓️ Раздел с событиями календаря</p>
              <p>Здесь будут отображаться ваши события</p>
            </div>
          </div>
        );

      case 'recommendations':
        return (
          <div className="recommendations-section">
            <h2>Рекомендации от ИИ</h2>
            <div className="coming-soon">
              <p>🤖 ИИ рекомендации для оптимизации времени</p>
              <p>Здесь будут предложения по улучшению вашего расписания</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="spinner"></div>
        <p>Загружаем ваш профиль...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-error">
        <div className="error-message">
          <p>Не удалось загрузить информацию о пользователе</p>
          <button onClick={() => navigate('/login')}>
            Вернуться к входу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <header className="profile-header">
        <h1>AI Calendar</h1>
        <div className="user-info">
          <img src={user.picture} alt={user.name} className="user-avatar" />
          <span>{user.name}</span>
          <button onClick={handleLogout} className="logout-button">
            Выйти
          </button>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="profile-sidebar">
          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeSection === 'calendar' ? 'active' : ''}`}
              onClick={() => setActiveSection('calendar')}
            >
              <span className="nav-icon">📅</span>
              <span className="nav-text">Календари</span>
            </button>
            
            <button
              className={`nav-item ${activeSection === 'events' ? 'active' : ''}`}
              onClick={() => setActiveSection('events')}
            >
              <span className="nav-icon">🗓️</span>
              <span className="nav-text">События</span>
            </button>
            
            <button
              className={`nav-item ${activeSection === 'recommendations' ? 'active' : ''}`}
              onClick={() => setActiveSection('recommendations')}
            >
              <span className="nav-icon">🤖</span>
              <span className="nav-text">ИИ Рекомендации</span>
            </button>
          </nav>
        </aside>

        <main className="profile-main">
          {renderSectionContent()}
        </main>
      </div>
    </div>
  );
};

export default Profile;
