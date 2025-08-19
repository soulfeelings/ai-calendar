import React, { useEffect, useState, useCallback } from 'react';
import { authService, User } from '../services/authService';
import { calendarService, Calendar, CalendarEvent } from '../services/calendarService';
import { useNavigate, useLocation } from 'react-router-dom';
import './Profile.css';

type ActiveSection = 'calendar' | 'events' | 'recommendations';

interface ProfileProps {
  activeSection?: ActiveSection;
}

const Profile: React.FC<ProfileProps> = ({ activeSection: propActiveSection }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Определяем активную секцию на основе URL или prop
  const getActiveSectionFromUrl = useCallback((): ActiveSection => {
    if (propActiveSection) return propActiveSection;
    if (location.pathname === '/events') return 'events';
    if (location.pathname === '/recommendations') return 'recommendations';
    return 'calendar';
  }, [propActiveSection, location.pathname]);

  const [activeSection, setActiveSection] = useState<ActiveSection>(getActiveSectionFromUrl());

  // Обновляем активную секцию при изменении URL
  useEffect(() => {
    setActiveSection(getActiveSectionFromUrl());
  }, [getActiveSectionFromUrl]);

  // Автоматически загружаем события с fullresponse=true при переходе на страницу событий
  useEffect(() => {
    if (activeSection === 'events' && !eventsLoaded) {
      loadEventsWithFullResponse();
    }
  }, [activeSection, eventsLoaded]);

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

        // Загружаем список календарей только для раздела 'calendar'
        // Добавляем дополнительную проверку URL для надежности
        const currentSection = getActiveSectionFromUrl();
        console.log('Current section:', currentSection, 'Path:', location.pathname);

        if (currentSection === 'calendar') {
          console.log('Loading calendars for calendar section');
          await loadCalendars();
        } else {
          console.log('Skipping calendar load for section:', currentSection);
        }

      } catch (error) {
        console.error('Error loading user info:', error);
        await authService.logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    loadUserAndCalendars();
  }, [navigate, getActiveSectionFromUrl, location.pathname]);

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

        // Подписываемся на вебхук только если он еще не настроен
        try {
          const wasSetup = await calendarService.setupWebhookIfNeeded();
          if (wasSetup) {
            console.log('Webhook setup successful');
          } else {
            console.log('Webhook was already configured');
          }
        } catch (webhookError) {
          console.warn('Webhook setup failed, but continuing:', webhookError);
          // Не показываем ошибку пользователю, так как это не критично
        }
      }

    } catch (error: any) {
      console.error('Error loading calendars:', error);
      setError('Ошибка при загрузке календарей');
    } finally {
      setCalendarLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      setEventsLoading(true);
      setEventsError(null);
      console.log('Attempting to load events...');

      const response = await calendarService.getCalendarEvents();

      // Проверяем оба возможных поля для событий
      const eventsList = response.items || response.events || [];

      if (eventsList.length > 0) {
        setEvents(eventsList);
        console.log('Events loaded successfully:', eventsList);
      } else {
        setEvents([]);
        console.log('No events found in response:', response);
      }

    } catch (error: any) {
      console.error('Error loading events:', error);
      setEventsError('Ошибка при загрузке событий');
    } finally {
      setEventsLoading(false);
    }
  };

  // Загружаем события с полным ответом (включая детали) при первом загрузке страницы событий
  const loadEventsWithFullResponse = async () => {
    try {
      setEventsLoading(true);
      setEventsError(null);
      console.log('Attempting to load events with full response...');

      const response = await calendarService.getCalendarEvents(false, true);

      // Проверяем оба возможных поля для событий
      const eventsList = response.items || response.events || [];

      if (eventsList.length > 0) {
        setEvents(eventsList);
        console.log('Events with full response loaded successfully:', eventsList);
      } else {
        setEvents([]);
        console.log('No events found in response:', response);
      }

    } catch (error: any) {
      console.error('Error loading events with full response:', error);
      setEventsError('Ошибка при загрузке событий');
    } finally {
      setEventsLoading(false);
      setEventsLoaded(true); // Помечаем, что события загружены
    }
  };

  const formatEventDate = (event: CalendarEvent) => {
    const startDate = event.start.dateTime || event.start.date;
    const endDate = event.end.dateTime || event.end.date;

    if (!startDate) return 'Дата не указана';

    const start = new Date(startDate);
    const end = new Date(endDate || startDate);

    const isAllDay = !event.start.dateTime;

    if (isAllDay) {
      return start.toLocaleDateString('ru-RU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    const isSameDay = start.toDateString() === end.toDateString();

    if (isSameDay) {
      return `${start.toLocaleDateString('ru-RU')} с ${start.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })} до ${end.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })}`;
    }

    return `${start.toLocaleDateString('ru-RU')} ${start.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })} - ${end.toLocaleDateString('ru-RU')} ${end.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
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
            <div className="section-header">
              <h2>События календаря</h2>
              <button
                onClick={loadEvents}
                className="refresh-button"
                disabled={eventsLoading}
              >
                {eventsLoading ? 'Загрузка...' : 'Загрузить события'}
              </button>
            </div>

            {eventsError && (
              <div className="error-banner">
                <p>{eventsError}</p>
              </div>
            )}

            {eventsLoading && (
              <div className="calendar-loading">
                <div className="spinner small"></div>
                <p>Загружаем события...</p>
              </div>
            )}

            {events.length > 0 && (
              <div className="events-list">
                <h3>Ваши события:</h3>
                {events.map((event) => (
                  <div key={event.id} className="event-item">
                    <div className="event-header">
                      <h4 className="event-title">{event.summary || 'Без названия'}</h4>
                      <span className={`event-status ${event.status}`}>
                        {event.status === 'confirmed' ? 'Подтверждено' : event.status}
                      </span>
                    </div>

                    <div className="event-details">
                      <div className="event-time">
                        <span className="event-icon">🕒</span>
                        <span>{formatEventDate(event)}</span>
                      </div>

                      {event.location && (
                        <div className="event-location">
                          <span className="event-icon">📍</span>
                          <span>{event.location}</span>
                        </div>
                      )}

                      {event.description && (
                        <div className="event-description">
                          <span className="event-icon">📝</span>
                          <span>{event.description}</span>
                        </div>
                      )}

                      <div className="event-organizer">
                        <span className="event-icon">👤</span>
                        <span>{event.organizer.displayName || event.organizer.email}</span>
                      </div>

                      {event.attendees && event.attendees.length > 0 && (
                        <div className="event-attendees">
                          <span className="event-icon">👥</span>
                          <span>{event.attendees.length} участник(ов)</span>
                        </div>
                      )}
                    </div>

                    <div className="event-actions">
                      <a
                        href={event.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="event-link"
                      >
                        Открыть в Google Calendar
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {events.length === 0 && !eventsLoading && !eventsError && (
              <div className="no-events">
                <p>События не найдены</p>
                <p>Нажмите "Загрузить события" чтобы получить ваши события из Google Calendar</p>
              </div>
            )}
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

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
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
        <div className="header-left">
          <button className="toggle-sidebar" onClick={toggleSidebar}>
            <span className="hamburger-icon">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
          <h1>AI Calendar</h1>
        </div>
        <div className="user-info">
          <img src={user.picture} alt={user.name} className="user-avatar" />
          <span>{user.name}</span>
          <button onClick={handleLogout} className="logout-button">
            Выйти
          </button>
        </div>
      </header>

      <div className="profile-layout">
        {sidebarVisible && (
          <aside className="profile-sidebar">
            <nav className="sidebar-nav">
              <button
                className={`nav-item ${activeSection === 'calendar' ? 'active' : ''}`}
                onClick={() => navigate('/profile')}
              >
                <span className="nav-icon">📅</span>
                <span className="nav-text">Календари</span>
              </button>

              <button
                className={`nav-item ${activeSection === 'events' ? 'active' : ''}`}
                onClick={() => navigate('/events')}
              >
                <span className="nav-icon">🗓️</span>
                <span className="nav-text">События</span>
              </button>

              <button
                className={`nav-item ${activeSection === 'recommendations' ? 'active' : ''}`}
                onClick={() => navigate('/recommendations')}
              >
                <span className="nav-icon">🤖</span>
                <span className="nav-text">ИИ Рекомендации</span>
              </button>
            </nav>
          </aside>
        )}

        <main className="profile-main">
          {renderSectionContent()}
        </main>
      </div>
    </div>
  );
};

export default Profile;
