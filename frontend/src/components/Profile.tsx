import React, { useEffect, useState, useCallback } from 'react';
import { authService, User } from '../services/authService';
import { calendarService, Calendar, CalendarEvent } from '../services/calendarService';
import { useNavigate, useLocation } from 'react-router-dom';
import RecurrenceBadge from './RecurrenceBadge';
import Recommendations from './Recommendations';
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
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false); // Флаг для предотвращения дублирования
  const [lastFocusTime, setLastFocusTime] = useState<number>(Date.now()); // Время последнего фокуса
  const [initialLoadDone, setInitialLoadDone] = useState(false); // Флаг первоначальной загрузки
  const [requestInProgress, setRequestInProgress] = useState(false); // Глобальный флаг запроса
  const [showOnlyActiveEvents, setShowOnlyActiveEvents] = useState(false); // Фильтр актуальных событий

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      // Cleanup function for component unmount
    };
  }, []);


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
    const newSection = getActiveSectionFromUrl();
    if (newSection !== activeSection) {
      setActiveSection(newSection);
      // Сбрасываем флаг первоначальной загрузки при смене секции
      if (newSection === 'events' && activeSection !== 'events') {
        setInitialLoadDone(false);
      }
    }
  }, [getActiveSectionFromUrl, activeSection]);

  // Реализация вашей логики кеширования для страницы /events
  const loadEventsWithCacheLogic = useCallback(async () => {
    if (eventsLoading || isUpdating || requestInProgress) {
      console.log('Events loading already in progress, skipping...');
      return;
    }

    try {
      setEventsLoading(true);
      setRequestInProgress(true);
      setEventsError(null);

      console.log('=== STARTING EVENTS CACHE LOGIC ===');

      // Шаг 1: Проверяем кеш и загружаем события
      const cacheResult = await calendarService.getEventsWithCache();

      // Проверяем, требуется ли авторизация календаря
      if (cacheResult.requires_authorization && cacheResult.authorization_url) {
        console.log('Calendar authorization required for events, redirecting to:', cacheResult.authorization_url);
        // Редиректим пользователя на страницу авторизации календаря
        window.location.href = cacheResult.authorization_url;
        return;
      }

      if (cacheResult.fromCache) {
        console.log('Events loaded from cache');
        setEvents(cacheResult.events);
        setCacheInfo(`Загружено из кеша: ${cacheResult.events.length} событий`);
      } else {
        console.log('Events loaded with full sync');
        setEvents(cacheResult.events);
        setCacheInfo(`Полная синхронизация: ${cacheResult.events.length} событий`);
      }

      // Помечаем, что первоначальная загрузка выполнена
      setInitialLoadDone(true);

      // Шаг 2: Проверяем обновления с защитой от дублирования
      // Делаем это асинхронно, чтобы не блокировать UI
      setTimeout(async () => {
        if (isUpdating || eventsLoading) {
          console.log('Another update already in progress, skipping scheduled update');
          return;
        }

        try {
          setIsUpdating(true);
          console.log('Checking for updates after initial load...');

          const updateResult = await calendarService.checkEventsUpdates();

          if (updateResult.hasChanges) {
            console.log('Updates found, using updated events list');
            // ИСПРАВЛЕНИЕ: Используем полный список событий из updateResult
            setEvents(updateResult.events);
            setCacheInfo(`Обновлено: ${updateResult.events.length} событий`);
          } else {
            console.log('No updates found');
            setCacheInfo(prev => prev + ' (актуальные)');
          }
        } catch (updateError) {
          console.warn('Failed to check updates:', updateError);
          // Не показываем ошибку пользователю, так как основные данные уже загружены
        } finally {
          setIsUpdating(false);
        }
      }, cacheResult.fromCache ? 100 : 1000);

    } catch (error: any) {
      console.error('Error in events cache logic:', error);

      // Проверяем, если ошибка связана с авторизацией календаря
      if (error.response?.data?.requires_authorization && error.response?.data?.authorization_url) {
        console.log('Calendar authorization required (from error), redirecting to:', error.response.data.authorization_url);
        window.location.href = error.response.data.authorization_url;
        return;
      }

      setEventsError('Ошибка при загрузке событий');
      setCacheInfo('Ошибка загрузки');
      setIsUpdating(false); // Сбрасываем флаг при ошибке
    } finally {
      setEventsLoading(false);
      setRequestInProgress(false);
    }
  }, [eventsLoading, isUpdating, requestInProgress]);

  useEffect(() => {
    if (activeSection === 'events' && !initialLoadDone) {
      console.log('Starting initial events load for /events section');
      loadEventsWithCacheLogic();
    }
  }, [activeSection, initialLoadDone, loadEventsWithCacheLogic]);

  // Принудительное обновление событий
  const forceRefreshEvents = async () => {
    try {
      setEventsLoading(true);
      setEventsError(null);

      console.log('Force refreshing events...');
      const refreshedEvents = await calendarService.forceRefreshEvents();

      setEvents(refreshedEvents);
      setCacheInfo(`Принудительное обновление: ${refreshedEvents.length} событий`);

    } catch (error: any) {
      console.error('Error force refreshing events:', error);
      setEventsError('Ошибка при принудительном обновлении');
    } finally {
      setEventsLoading(false);
    }
  };

  // Очистка кеша ��ля отладки
  const clearCache = () => {
    calendarService.clearEventsCache();
    setCacheInfo('Кеш очищен');
    console.log('Cache cleared manually');
  };

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

      // Проверяем, требуется ли авторизация календаря
      if (response.requires_authorization && response.authorization_url) {
        console.log('Calendar authorization required, redirecting to:', response.authorization_url);
        // Редиректим пользователя на страницу авторизации календаря
        window.location.href = response.authorization_url;
        return;
      }

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

  const formatEventDateModern = (event: CalendarEvent) => {
    const startDate = event.start.dateTime || event.start.date;
    const endDate = event.end.dateTime || event.end.date;

    if (!startDate) return { date: 'Дата не указана', time: '', duration: '', endInfo: '' };

    const start = new Date(startDate);
    const end = new Date(endDate || startDate);

    const isAllDay = !event.start.dateTime;
    const isMultiDay = start.toDateString() !== end.toDateString();

    if (isAllDay) {
      if (isMultiDay) {
        // Событие на несколько дней
        const startDateStr = start.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short'
        });
        const endDateStr = end.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'short'
        });
        return {
          date: `${startDateStr} - ${endDateStr}`,
          time: 'Весь день',
          duration: '',
          endInfo: `До ${endDateStr}`
        };
      } else {
        // Событие на один день
        const date = start.toLocaleDateString('ru-RU', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        return { date, time: 'Весь день', duration: '', endInfo: '' };
      }
    }

    // События с конкретным временем
    const startDateStr = start.toLocaleDateString('ru-RU', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const startTime = start.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const endTime = end.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.ceil(durationMs / (1000 * 60));

    let duration = '';
    if (durationMinutes < 60) {
      duration = `${durationMinutes}мин`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      duration = minutes > 0 ? `${hours}ч ${minutes}мин` : `${hours}ч`;
    }

    if (isMultiDay) {
      // Событие с временем на несколько дней
      const endDateStr = end.toLocaleDateString('ru-RU', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      return {
        date: startDateStr,
        time: startTime,
        duration: `До ${endDateStr} ${endTime}`,
        endInfo: `${endDateStr} ${endTime}`
      };
    } else {
      // Событие в один день
      return {
        date: startDateStr,
        time: `${startTime}-${endTime}`,
        duration,
        endInfo: `До ${endTime}`
      };
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
                <div className="events-list-header">
                  <h3>
                    {showOnlyActiveEvents
                      ? `Актуальные события (${getFilteredEvents().length})`
                      : `Ваши события (${events.length})`
                    }
                  </h3>
                  <div className="events-filter">
                    <label className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={showOnlyActiveEvents}
                        onChange={toggleActiveEventsFilter}
                      />
                      <span className="checkmark"></span>
                      Только актуальные
                    </label>
                  </div>
                </div>
                <div className="events-grid">
                  {getFilteredEvents().map((event) => (
                    <div key={event.id} className={`event-card ${!isEventActive(event) ? 'event-past' : ''} ${isEventRecurring(event) ? 'event-recurring' : ''}`}>
                      <div className="event-card-header">
                        <div className="event-time-block">
                          <div className="event-date">
                            {formatEventDateModern(event).date}
                          </div>
                          <div className="event-time">
                            {formatEventDateModern(event).time}
                          </div>
                          <div className="event-duration">
                            {formatEventDateModern(event).duration}
                          </div>
                        </div>
                        <div className="event-main-info">
                          <div className="event-title-row">
                            <h4 className="event-title">{event.summary || 'Без названия'}</h4>
                            <div className="event-badges">
                              <RecurrenceBadge event={event} />
                              <span className={`event-status status-${event.status}`}>
                                {event.status === 'confirmed' ? '✓' : event.status === 'tentative' ? '?' : '✕'}
                              </span>
                            </div>
                          </div>
                          {event.location && (
                            <div className="event-location">
                              <span className="location-icon">📍</span>
                              <span>{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {(event.description || event.attendees?.length) && (
                        <div className="event-card-body">
                          {event.description && (
                            <div className="event-description">
                              <p>{event.description.length > 100 ?
                                event.description.substring(0, 100) + '...' :
                                event.description}
                              </p>
                            </div>
                          )}
                          {event.attendees && event.attendees.length > 0 && (
                            <div className="event-attendees">
                              <span className="attendees-count">
                                👥 {event.attendees.length} участник{event.attendees.length > 1 ? 'ов' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="event-card-footer">
                        <div className="event-organizer">
                          <span className="organizer-info">
                            👤 {event.organizer.displayName || event.organizer.email.split('@')[0]}
                          </span>
                        </div>
                        <a
                          href={event.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="event-link-btn"
                          title="Открыть в Google Calendar"
                        >
                          <span>📅</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {showOnlyActiveEvents && getFilteredEvents().length === 0 && (
                  <div className="no-active-events">
                    <p>📅 Актуальных событий нет</p>
                    <p>Все ваши события уже завершились</p>
                  </div>
                )}
              </div>
            )}

            {events.length === 0 && !eventsLoading && !eventsError && (
              <div className="no-events">
                <p>События не найдены</p>
                <p>Нажмите "Загрузить события" чтобы получить ваши события из Google Calendar</p>
              </div>
            )}

            <div className="cache-info">
              <p>{cacheInfo}</p>
            </div>

            <div className="events-actions">
              <button onClick={forceRefreshEvents} className="action-button">
                Принудительно обновить события
              </button>
              <button onClick={clearCache} className="action-button">
                Очистить кеш
              </button>
            </div>
          </div>
        );

      case 'recommendations':
        return <Recommendations />;

      default:
        return null;
    }
  };

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // Проверка обновлений при возвращении фокуса на вкладку
  const checkEventsUpdatesOnFocus = useCallback(async () => {
    if (isUpdating || eventsLoading || requestInProgress) {
      console.log('Update already in progress, skipping focus update');
      return;
    }

    try {
      setIsUpdating(true);
      setRequestInProgress(true);
      console.log('Checking for updates on focus with full response...');

      // ИСПРАВЛЕНИЕ: Используем новый метод с fullresponse=true
      const updateResult = await calendarService.checkEventsUpdatesWithFullResponse();

      if (updateResult.hasChanges) {
        console.log('Updates found on focus, replacing all events');
        setEvents(updateResult.events); // Полная замена всех событий
        setCacheInfo(`Обновлено при возвращении: ${updateResult.events.length} событий`);
      } else {
        console.log('No updates found on focus');
        // Если изменений нет, всё равно обновляем события из полного ответа
        setEvents(updateResult.events);
        setCacheInfo(`Проверено при возвращении: ${updateResult.events.length} событий (актуальные)`);
      }

      // Обновляем время последнего фокуса
      setLastFocusTime(Date.now());

    } catch (error) {
      console.warn('Failed to check updates on focus:', error);
      // Не показываем ошибку пользователю
    } finally {
      setIsUpdating(false);
      setRequestInProgress(false);
    }
  }, [isUpdating, eventsLoading, requestInProgress]);

  // Обработка переключения между вкладками ���раузера
  useEffect(() => {
    if (activeSection !== 'events' || !initialLoadDone) return;

    let debounceTimer: NodeJS.Timeout | null = null;
    const FOCUS_DEBOUNCE_DELAY = 300; // Увеличиваем задержку для надежности

    const handleVisibilityChange = () => {
      if (!document.hidden && initialLoadDone) {
        // Вкладка стала активной
        console.log('Tab became visible, checking if update needed...');

        // Проверяем, прошло ли достаточно времени с последнего обновления
        const timeSinceLastFocus = Date.now() - lastFocusTime;
        const MIN_UPDATE_INTERVAL = 5000; // Минимум 5 секунд между обновлениями

        if (timeSinceLastFocus < MIN_UPDATE_INTERVAL) {
          console.log(`Too soon since last update (${timeSinceLastFocus}ms), skipping`);
          return;
        }

        // Очищаем предыдущий таймер если есть
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        // Добавляем задержку для дебаунсинга
        debounceTimer = setTimeout(() => {
          if (!isUpdating && !eventsLoading && !requestInProgress) {
            console.log('Executing focus update check');
            checkEventsUpdatesOnFocus();
          } else {
            console.log('Skipping focus update - another operation in progress');
          }
        }, FOCUS_DEBOUNCE_DELAY);
      }
    };

    const handleWindowFocus = () => {
      if (!initialLoadDone) return;

      console.log('Window gained focus, checking if update needed...');

      // Проверяем, прошло ли достаточно времени с последнего обновления
      const timeSinceLastFocus = Date.now() - lastFocusTime;
      const MIN_UPDATE_INTERVAL = 5000; // Минимум 5 секунд между обновлениями

      if (timeSinceLastFocus < MIN_UPDATE_INTERVAL) {
        console.log(`Too soon since last update (${timeSinceLastFocus}ms), skipping`);
        return;
      }

      // Очищаем предыдущий таймер если есть
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Добавляем задержку для дебаунсинга
      debounceTimer = setTimeout(() => {
        if (!isUpdating && !eventsLoading && !requestInProgress) {
          console.log('Executing window focus update check');
          checkEventsUpdatesOnFocus();
        } else {
          console.log('Skipping window focus update - another operation in progress');
        }
      }, FOCUS_DEBOUNCE_DELAY);
    };

    // Добавляем слушатели событий
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      // Очищаем таймер при размонтировании
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // Убираем слушатели при размонтировании или смене секции
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [activeSection, initialLoadDone, isUpdating, eventsLoading, requestInProgress, lastFocusTime, checkEventsUpdatesOnFocus]);

  // Функция для проверки актуальности события
  const isEventActive = (event: CalendarEvent): boolean => {
    // Повторяющиеся события всегда считаем актуальными,
    // так как они продолжаются в будущем
    if (isEventRecurring(event)) {
      return true;
    }

    const endDate = event.end.dateTime || event.end.date;
    if (!endDate) return true; // Если нет даты окончания, считаем актуальным

    const now = new Date();
    const eventEnd = new Date(endDate);

    // Для событий на весь день добавляем время до конца дня
    if (!event.end.dateTime) {
      eventEnd.setHours(23, 59, 59, 999);
    }

    return eventEnd > now;
  };

  // Фильтрация событий
  const getFilteredEvents = (): CalendarEvent[] => {
    if (!showOnlyActiveEvents) {
      return events;
    }
    return events.filter(isEventActive);
  };

  // Функция для проверки, является ли событие повторяющимся
  const isEventRecurring = (event: CalendarEvent): boolean => {
    return !!(event.recurrence && event.recurrence.length > 0) || !!event.recurringEventId;
  };

  // Функция переключения фильтра
  const toggleActiveEventsFilter = () => {
    setShowOnlyActiveEvents(!showOnlyActiveEvents);
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

              <button
                className="nav-item"
                onClick={() => navigate('/goals')}
              >
                <span className="nav-icon">🎯</span>
                <span className="nav-text">Цели (SMART)</span>
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
