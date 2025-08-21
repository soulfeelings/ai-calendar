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
  const [selectedDate, setSelectedDate] = useState<string>(''); // Для выбора конкретной даты

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

    if (!startDate) return { date: 'Дата не указана', time: '', duration: '', isAllDay: false };

    const start = new Date(startDate);
    const end = new Date(endDate || startDate);

    const isAllDay = !event.start.dateTime;

    if (isAllDay) {
      return {
        date: start.toLocaleDateString('ru-RU', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        time: 'Весь день',
        duration: '',
        isAllDay: true
      };
    }

    const isSameDay = start.toDateString() === end.toDateString();
    const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

    if (isSameDay) {
      return {
        date: start.toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        }),
        time: `${start.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        })} — ${end.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        })}`,
        duration: duration >= 60 ? `${Math.floor(duration / 60)}ч ${duration % 60}м` : `${duration}м`,
        isAllDay: false
      };
    }

    return {
      date: `${start.toLocaleDateString('ru-RU')} — ${end.toLocaleDateString('ru-RU')}`,
      time: `${start.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })} — ${end.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      })}`,
      duration: duration >= 60 ? `${Math.floor(duration / 60)}ч ${duration % 60}м` : `${duration}м`,
      isAllDay: false
    };
  };

  // Расширенный тип для поддержки многодневных событий
  interface ExtendedCalendarEvent extends CalendarEvent {
    originalId?: string;
    isMultiDay?: boolean;
    isFirstDay?: boolean;
    isLastDay?: boolean;
    multiDayIndex?: number;
  }

  const expandMultiDayEvents = (events: CalendarEvent[]): ExtendedCalendarEvent[] => {
    const expandedEvents: ExtendedCalendarEvent[] = [];

    events.forEach(event => {
      const startDate = event.start.dateTime || event.start.date;
      const endDate = event.end.dateTime || event.end.date;

      if (!startDate || !endDate) {
        expandedEvents.push(event);
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Если событие в один день, просто добавляем
      if (start.toDateString() === end.toDateString()) {
        expandedEvents.push(event);
        return;
      }

      // Для многодневных событий создаем копии на каждый день
      const currentDate = new Date(start);
      let dayIndex = 0;

      while (currentDate <= end) {
        const isFirstDay = dayIndex === 0;
        const isLastDay = currentDate.toDateString() === end.toDateString();

        const dayEvent: ExtendedCalendarEvent = {
          ...event,
          id: `${event.id}-day-${dayIndex}`,
          originalId: event.id,
          isMultiDay: true,
          isFirstDay,
          isLastDay,
          multiDayIndex: dayIndex,
          start: {
            ...event.start,
            dateTime: isFirstDay ? event.start.dateTime : undefined,
            date: currentDate.toISOString().split('T')[0]
          },
          end: {
            ...event.end,
            dateTime: isLastDay ? event.end.dateTime : undefined,
            date: currentDate.toISOString().split('T')[0]
          }
        };

        expandedEvents.push(dayEvent);

        currentDate.setDate(currentDate.getDate() + 1);
        dayIndex++;
      }
    });

    return expandedEvents;
  };

  const getActiveEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    const now = new Date();

    return events.filter(event => {
      const startDate = event.start.dateTime || event.start.date;
      const endDate = event.end.dateTime || event.end.date;

      if (!startDate || !endDate) return false;

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Событие активно, если текущее время между началом и концом
      return now >= start && now <= end;
    });
  };

  const getFilteredEvents = (): ExtendedCalendarEvent[] => {
    let filteredEvents = events;

    console.log('getFilteredEvents called:', { 
      selectedDate, 
      totalEvents: events.length 
    });

    // Если выбрана конкретная дата, фильтруем по ней
    if (selectedDate) {
      console.log('Filtering by selected date:', selectedDate);
      
      filteredEvents = events.filter(event => {
        const startDate = event.start.dateTime || event.start.date;
        const endDate = event.end.dateTime || event.end.date;

        if (!startDate || !endDate) return false;

        const start = new Date(startDate);
        const end = new Date(endDate);
        const selectedDateObj = new Date(selectedDate);

        // Проверяем, попадает ли выбранная дата в диапазон события
        // Учитываем только дату, игнорируя время
        const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        const selectedDateOnly = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());

        const isInRange = selectedDateOnly >= startDateOnly && selectedDateOnly <= endDateOnly;
        
        console.log('Event check:', {
          eventTitle: event.summary,
          startDate: startDateOnly.toISOString().split('T')[0],
          endDate: endDateOnly.toISOString().split('T')[0],
          selectedDate: selectedDateOnly.toISOString().split('T')[0],
          isInRange
        });

        return isInRange;
      });
      
      console.log('Filtered events by date:', filteredEvents.length);
    } else {
      // Если дата не выбрана, показываем только активные события
      console.log('No date selected, filtering active events');
      filteredEvents = getActiveEvents(events);
      console.log('Active events found:', filteredEvents.length);
    }

    // Разворачиваем многодневные события
    const expandedEvents = expandMultiDayEvents(filteredEvents);
    console.log('Final expanded events:', expandedEvents.length);
    
    return expandedEvents;
  };

  const groupEventsByDate = (events: ExtendedCalendarEvent[]) => {
    const groups: { [key: string]: CalendarEvent[] } = {};

    events.forEach(event => {
      const startDate = event.start.dateTime || event.start.date;
      if (startDate) {
        const date = new Date(startDate);
        const dateKey = date.toISOString().split('T')[0];

        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(event);
      }
    });

    // Сортируем события внутри каждого дня по времени
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => {
        const timeA = a.start.dateTime || a.start.date;
        const timeB = b.start.dateTime || b.start.date;
        if (!timeA || !timeB) return 0;
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      });
    });

    return groups;
  };

  const isEventSoon = (event: CalendarEvent) => {
    const startDate = event.start.dateTime || event.start.date;
    if (!startDate) return false;

    const start = new Date(startDate);
    const now = new Date();
    const diffHours = (start.getTime() - now.getTime()) / (1000 * 60 * 60);

    return diffHours > 0 && diffHours <= 2;
  };

  const isEventNow = (event: CalendarEvent) => {
    const startDate = event.start.dateTime || event.start.date;
    const endDate = event.end.dateTime || event.end.date;

    if (!startDate || !endDate) return false;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    return now >= start && now <= end;
  };

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
  };

  const clearDateFilter = () => {
    setSelectedDate('');
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
        const filteredEvents = getFilteredEvents();
        const groupedEvents = groupEventsByDate(filteredEvents);
        const sortedDates = Object.keys(groupedEvents).sort();

        // Определяем тип отображения
        const isShowingActiveOnly = !selectedDate;

        return (
          <div className="events-section">
            <div className="section-header">
              <div className="header-content">
                <h2>
                  <span className="section-icon">📅</span>
                  События календаря
                </h2>
                <div className="events-stats">
                  <span className="events-count">{filteredEvents.length} событий</span>
                  <span className="events-timeframe">
                    {selectedDate ?
                      `на ${new Date(selectedDate).toLocaleDateString('ru-RU')}` :
                      'активные сейчас'
                    }
                  </span>
                </div>
              </div>
              <div className="section-controls">
                <div className="date-picker-container">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateSelect(e.target.value)}
                    className="date-picker modern"
                    title="Выберите дату для просмотра событий"
                  />
                  {selectedDate && (
                    <button
                      onClick={clearDateFilter}
                      className="clear-date-button"
                      title="Показать активные события"
                    >
                      <span className="clear-icon">✕</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={loadEvents}
                  className="refresh-button modern"
                  disabled={eventsLoading}
                >
                  <span className="button-icon">🔄</span>
                  {eventsLoading ? 'Загрузка...' : 'Обновить'}
                </button>
              </div>
            </div>

            {eventsError && (
              <div className="error-banner modern">
                <div className="error-icon">⚠️</div>
                <div className="error-content">
                  <h4>Ошибка загрузки</h4>
                  <p>{eventsError}</p>
                </div>
              </div>
            )}

            {eventsLoading && (
              <div className="loading-container modern">
                <div className="loading-spinner"></div>
                <div className="loading-content">
                  <h3>Загружаем события...</h3>
                  <p>Получаем данные из Google Calendar</p>
                </div>
              </div>
            )}

            {filteredEvents.length > 0 && (
              <div className="events-timeline">
                {sortedDates.map((dateKey) => {
                  const dayEvents = groupedEvents[dateKey];
                  const date = new Date(dateKey + 'T00:00:00');
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isTomorrow = date.toDateString() === new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString();

                  let dayLabel;
                  if (isToday) {
                    dayLabel = 'Сегодня';
                  } else if (isTomorrow) {
                    dayLabel = 'Завтра';
                  } else {
                    dayLabel = date.toLocaleDateString('ru-RU', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    });
                  }

                  return (
                    <div key={dateKey} className="day-group">
                      <div className={`day-header ${isToday ? 'today' : ''}`}>
                        <div className="day-indicator"></div>
                        <div className="day-info">
                          <h3 className="day-label">{dayLabel}</h3>
                          <span className="day-date">{date.toLocaleDateString('ru-RU')}</span>
                          <span className="events-count-day">{dayEvents.length} событий</span>
                        </div>
                      </div>

                      <div className="day-events">
                        {dayEvents.map((event, index) => {
                          const eventTime = formatEventDate(event);
                          const isSoon = isEventSoon(event);
                          const isNow = isEventNow(event);
                          const isMultiDay = (event as any).isMultiDay;
                          const isFirstDay = (event as any).isFirstDay;
                          const isLastDay = (event as any).isLastDay;

                          return (
                            <div
                              key={event.id}
                              className={`event-card modern ${isNow ? 'happening-now' : ''} ${isSoon ? 'happening-soon' : ''} ${isMultiDay ? 'multi-day' : ''}`}
                            >
                              <div className="event-timeline-indicator">
                                <div className={`timeline-dot ${isNow ? 'now' : isSoon ? 'soon' : ''}`}></div>
                                {index < dayEvents.length - 1 && <div className="timeline-line"></div>}
                              </div>

                              <div className="event-content">
                                <div className="event-header">
                                  <div className="event-title-section">
                                    <h4 className="event-title">
                                      {event.summary || 'Без названия'}
                                      {isMultiDay && (
                                        <span className="multi-day-indicator">
                                          {isFirstDay ? ' (начало)' : isLastDay ? ' (окончание)' : ' (продолжение)'}
                                        </span>
                                      )}
                                    </h4>
                                    {isNow && <span className="status-badge now">Сейчас</span>}
                                    {isSoon && !isNow && <span className="status-badge soon">Скоро</span>}
                                  </div>
                                  <div className={`event-status ${event.status}`}>
                                    {event.status === 'confirmed' ? '✓' : event.status}
                                  </div>
                                </div>

                                <div className="event-time-info">
                                  <div className="time-primary">
                                    <span className="time-icon">🕐</span>
                                    <span className="time-text">
                                      {isMultiDay ?
                                        (isFirstDay ? `С ${eventTime.time}` :
                                         isLastDay ? `До ${eventTime.time}` :
                                         'Весь день') :
                                        eventTime.time
                                      }
                                    </span>
                                  </div>
                                  {!eventTime.isAllDay && !isMultiDay && (
                                    <div className="time-duration">
                                      <span className="duration-icon">⏱</span>
                                      <span className="duration-text">{eventTime.duration}</span>
                                    </div>
                                  )}
                                </div>

                                {event.location && (
                                  <div className="event-location">
                                    <span className="location-icon">📍</span>
                                    <span className="location-text">{event.location}</span>
                                  </div>
                                )}

                                {event.description && (
                                  <div className="event-description">
                                    <span className="description-text">{event.description.length > 100 ?
                                      event.description.substring(0, 100) + '...' :
                                      event.description}
                                    </span>
                                  </div>
                                )}

                                <div className="event-meta">
                                  <div className="event-organizer">
                                    <span className="organizer-icon">👤</span>
                                    <span className="organizer-text">
                                      {event.organizer.displayName || event.organizer.email}
                                    </span>
                                  </div>

                                  {event.attendees && event.attendees.length > 0 && (
                                    <div className="event-attendees">
                                      <span className="attendees-icon">👥</span>
                                      <span className="attendees-text">{event.attendees.length}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="event-actions">
                                  <a
                                    href={event.htmlLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="event-link modern"
                                  >
                                    <span className="link-icon">🔗</span>
                                    Открыть в Google Calendar
                                  </a>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredEvents.length === 0 && !eventsLoading && !eventsError && (
              <div className="no-events modern">
                <div className="no-events-icon">📅</div>
                <h3>
                  {selectedDate ?
                    `События на ${new Date(selectedDate).toLocaleDateString('ru-RU')} не найдены` :
                    'Нет активных событий'
                  }
                </h3>
                <p>
                  {selectedDate ?
                    'Попробуйте выбрать другую дату или очистить фильтр' :
                    'В данный момент нет событий, которые бы проходили сейчас'
                  }
                </p>
                {selectedDate ? (
                  <button onClick={clearDateFilter} className="load-events-button">
                    <span className="button-icon">🗓️</span>
                    Показать активные события
                  </button>
                ) : (
                  <button onClick={loadEvents} className="load-events-button">
                    <span className="button-icon">📥</span>
                    Загрузить события
                  </button>
                )}
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
