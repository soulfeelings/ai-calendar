import React, { useState } from 'react';
import { aiService, CalendarAnalysis as AICalendarAnalysis, SmartGoal as AISmartGoal, ScheduleChange as AIScheduleChange } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import recommendationsCacheService from '../services/recommendationsCacheService';
import GoalsWarningModal from './GoalsWarningModal';
import './Recommendations.css';

// Используем типы из aiService вместо локальных
type CalendarAnalysis = AICalendarAnalysis;
type SmartGoal = AISmartGoal;
type ScheduleChange = AIScheduleChange;

// ��ипы для нового дизайна
type ViewMode = 'selection' | 'week' | 'tomorrow' | 'analysis';
type TimeSlot = {
  time: string;
  events: CalendarEvent[];
  isFree: boolean;
  isOptimal: boolean;
  suggestion?: string;
};

interface DayData {
  date: Date;
  dateStr: string;
  dayName: string;
  timeSlots: TimeSlot[];
  totalEvents: number;
  freeHours: number;
  optimalSlots: number;
}

interface WeekData {
  days: DayData[];
  weekRange: string;
  totalFreeHours: number;
  busyDays: number;
}

// Компонент выбора режима анализа
const AnalysisSelector: React.FC<{
  onSelectMode: (mode: 'week' | 'tomorrow') => void;
}> = ({ onSelectMode }) => {
  const [cacheInfo, setCacheInfo] = useState<any>(null);

  // Загружаем информацию о кеше при монтировании компонента
  React.useEffect(() => {
    const info = recommendationsCacheService.getCacheInfo();
    setCacheInfo(info);
  }, []);

  const handleClearCache = () => {
    recommendationsCacheService.clearAllRecommendations();
    const info = recommendationsCacheService.getCacheInfo();
    setCacheInfo(info);
    console.log('🧹 Cache cleared successfully');
  };

  return (
    <div className="analysis-selector">
      <div className="selector-header">
        <h2>🤖 AI Календарь</h2>
        <p>Выберите тип анализа для получения персональных рекомендаций</p>

        {/* Информация о кеше */}
        {cacheInfo && cacheInfo.total > 0 && (
          <div className="cache-info">
            <div className="cache-summary">
              📦 Кешировано: {cacheInfo.total} анализов
              (📅 {cacheInfo.byType.week} недельных, 🌅 {cacheInfo.byType.tomorrow} завтрашних)
            </div>
            <button className="clear-cache-btn" onClick={handleClearCache}>
              🗑️ Очистить кеш
            </button>
          </div>
        )}
      </div>

      <div className="mode-cards">
        <div
          className="mode-card week-card"
          onClick={() => onSelectMode('week')}
        >
          <div className="mode-icon">📅</div>
          <h3>Анализ календаря на неделю</h3>
          <p>ИИ проанализирует ваш календарь на неделю, найдет свободные слоты и предложит оптимальное расписание для достижения целей</p>
          <div className="mode-features">
            <span>• Анализ существующих событий календаря</span>
            <span>• Поиск свободных временных слотоов</span>
            <span>• Оптимальное использование свободного времени</span>
            <span>• Предложения для работы над целями</span>
          </div>
          <div className="mode-cta">Анализировать календарь недели →</div>
        </div>

        <div
          className="mode-card tomorrow-card"
          onClick={() => onSelectMode('tomorrow')}
        >
          <div className="mode-icon">🌅</div>
          <h3>Анализ календаря на завтра</h3>
          <p>ИИ изучит ваше расписание на завтра, найдет свободные промежутки и предложит как лучше использовать время для целей</p>
          <div className="mode-features">
            <span>• Анализ событий завтрашнего дня</span>
            <span>• Поиск свободных окон между встречами</span>
            <span>• Учет времени на дорогу и перерывы</span>
            <span>• Конкретные предложения для свободного времени</span>
          </div>
          <div className="mode-cta">Анализировать календарь завтра →</div>
        </div>
      </div>
    </div>
  );
};

// Компонент временной шкалы
const TimelineView: React.FC<{
  dayData: DayData;
  showSuggestions: boolean;
  onApplySuggestion: (time: string, suggestion: string) => void;
}> = ({ dayData, showSuggestions, onApplySuggestion }) => {
  return (
    <div className="timeline-view">
      <div className="timeline-header">
        <h3>{dayData.dayName}</h3>
        <span className="date-label">{dayData.dateStr}</span>
        <div className="day-stats">
          <span className="stat">📅 {dayData.totalEvents} событий</span>
          <span className="stat">⏰ {dayData.freeHours}ч свободно</span>
          <span className="stat">✨ {dayData.optimalSlots} оптимальных слотов</span>
        </div>
      </div>

      <div className="timeline-slots">
        {dayData.timeSlots.map((slot, index) => (
          <div
            key={index}
            className={`time-slot ${slot.isFree ? 'free' : 'busy'} ${slot.isOptimal ? 'optimal' : ''}`}
          >
            <div className="slot-time">{slot.time}</div>
            <div className="slot-content">
              {slot.events.length > 0 ? (
                <div className="slot-events">
                  {slot.events.map((event, i) => (
                    <div key={i} className="slot-event">{event.summary}</div>
                  ))}
                </div>
              ) : (
                <div className="slot-free">
                  {slot.isOptimal && <span className="optimal-badge">✨ Оптимально</span>}
                  Свободно
                </div>
              )}

              {showSuggestions && slot.suggestion && (
                <div className="slot-suggestion">
                  <div className="suggestion-text">{slot.suggestion}</div>
                  <button
                    className="apply-suggestion-btn"
                    onClick={() => onApplySuggestion(slot.time, slot.suggestion!)}
                  >
                    ➕ Добавить
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Компон����нт недельного обзора
const WeekView: React.FC<{
  weekData: WeekData;
  recommendations: string[];
  scheduleChanges: ScheduleChange[];
  onApplyChange: (change: ScheduleChange) => void;
  onRejectChange: (change: ScheduleChange) => void;
  onCreateEvent?: (change: ScheduleChange) => void;
  onRejectEvent?: (change: ScheduleChange) => void;
}> = ({ weekData, recommendations, scheduleChanges, onApplyChange, onRejectChange, onCreateEvent, onRejectEvent }) => {
  return (
    <div className="week-view">
      <div className="week-header">
        <h2>📅 Анализ календаря на неделю</h2>
        <div className="week-range">{weekData.weekRange}</div>
        <div className="week-summary">
          <div className="summary-card">
            <span className="summary-number">{scheduleChanges.length}</span>
            <span className="summary-label">предложений для свободного времени</span>
          </div>
          <div className="summary-card">
            <span className="summary-number">{7 - weekData.busyDays}</span>
            <span className="summary-label">дней для оптимизации</span>
          </div>
          <div className="summary-card">
            <span className="summary-number">{weekData.totalFreeHours}</span>
            <span className="summary-label">часов свободно</span>
          </div>
        </div>
      </div>

      <div className="week-grid">
        {weekData.days.map((day, index) => (
          <div key={index} className="day-card">
            <div className="day-header">
              <h4>{day.dayName}</h4>
              <span className="day-date">{day.date.getDate()}</span>
            </div>
            <div className="day-preview">
              <div className="day-stats">
                <span>📅 {day.totalEvents}</span>
                <span>⏰ {day.freeHours}ч</span>
              </div>
              <div className="day-load-bar">
                <div
                  className="load-fill"
                  style={{
                    width: `${Math.min(100, (day.totalEvents / 8) * 100)}%`,
                    backgroundColor: day.totalEvents > 6 ? '#ff6b6b' : day.totalEvents > 3 ? '#ffd93d' : '#6bcf7f'
                  }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {recommendations.length > 0 && (
        <div className="recommendations-section">
          <h3>🤖 AI Рекомендации</h3>
          <div className="recommendations-grid">
            {recommendations.map((rec, index) => (
              <div key={index} className="recommendation-card-new">
                <div className="rec-icon">💡</div>
                <p>{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {scheduleChanges.length > 0 && (
        <div className="changes-section">
          <h3>⚡ Предлагаемые изменения</h3>
          <div className="changes-grid">
            {scheduleChanges.map((change, index) => (
              <ScheduleChangeCardNew
                key={index}
                change={change}
                onApply={() => onApplyChange(change)}
                onReject={() => onRejectChange(change)}
                onCreateEvent={onCreateEvent}
                onRejectEvent={onRejectEvent}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Обновл����ная карточка изменения расписания
const ScheduleChangeCardNew: React.FC<{
  change: ScheduleChange;
  onApply: () => void;
  onReject: () => void;
  onCreateEvent?: (change: ScheduleChange) => void;
  onRejectEvent?: (change: ScheduleChange) => void;
}> = ({ change, onApply, onReject, onCreateEvent, onRejectEvent }) => {
  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'move': return '📅';
      case 'reschedule': return '⏰';
      case 'cancel': return '❌';
      case 'optimize': return '⚡';
      case 'create': return '➕';
      case 'add': return '➕';
      default: return '🔄';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return '#ff6b6b';
      case 'medium': return '#ffd93d';
      case 'low': return '#6bcf7f';
      default: return '#a0a0a0';
    }
  };

  const formatDateTime = (dateTimeStr: string) => {
    try {
      return new Date(dateTimeStr).toLocaleString('ru-RU');
    } catch {
      return dateTimeStr;
    }
  };

  // Определяем, является ли это новым событием
  const isNewEvent = change.is_new_event || 
                     change.action.toLowerCase() === 'create' ||
                     change.action.toLowerCase() === 'add' ||
                     (!change.new_start && !change.new_end && change.title);

  return (
    <div className="schedule-change-card-new">
      <div className="change-header-new">
        <div className="change-icon">{getActionIcon(change.action)}</div>
        <div className="change-title-new">
          <h4>{change.title}</h4>
          <div className="change-meta">
            {change.priority && (
              <div
                className="priority-indicator"
                style={{ backgroundColor: getPriorityColor(change.priority) }}
              >
                {change.priority}
              </div>
            )}
            {isNewEvent && (
              <div className="new-event-badge">
                ✨ Новое событие
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="change-body-new">
        <p className="change-reason-new">{change.reason}</p>

        {/* Показываем детали события для новых событий */}
        {isNewEvent && (change.new_start || change.new_end) && (
          <div className="event-details">
            <h5>📅 Детали события:</h5>
            {change.new_start && (
              <div className="event-detail">
                <span className="detail-label">📅 Начало:</span>
                <span className="detail-value">{formatDateTime(change.new_start)}</span>
              </div>
            )}
            {change.new_end && (
              <div className="event-detail">
                <span className="detail-label">🕘 Конец:</span>
                <span className="detail-value">{formatDateTime(change.new_end)}</span>
              </div>
            )}
            {change.description && (
              <div className="event-detail">
                <span className="detail-label">📝 Описание:</span>
                <span className="detail-value">{change.description}</span>
              </div>
            )}
            {change.location && (
              <div className="event-detail">
                <span className="detail-label">📍 Место:</span>
                <span className="detail-value">{change.location}</span>
              </div>
            )}
          </div>
        )}

        {/* Показываем изменения времени для существующих событий */}
        {!isNewEvent && (change.new_start || change.new_end) && (
          <div className="change-time-new">
            {change.new_start && (
              <div className="time-change">
                <span className="time-label">Новое время начала:</span>
                <span className="time-value">
                  {formatDateTime(change.new_start)}
                </span>
              </div>
            )}
            {change.new_end && (
              <div className="time-change">
                <span className="time-label">Новое время окончания:</span>
                <span className="time-value">
                  {formatDateTime(change.new_end)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="change-actions-new">
        {isNewEvent ? (
          // Кнопки для новых событий
          <>
            <button 
              className="add-event-btn" 
              onClick={() => onCreateEvent?.(change)}
            >
              ➕ Добавить в календарь
            </button>
            <button 
              className="reject-event-btn" 
              onClick={() => onRejectEvent?.(change)}
            >
              ❌ Отклонить
            </button>
          </>
        ) : (
          // Кнопк�� для изменений существующих событий
          <>
            <button className="apply-btn-new" onClick={onApply}>
              ✅ Применить
            </button>
            <button className="reject-btn-new" onClick={onReject}>
              ❌ Отклонить
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// Основной компонент Recommendations
const Recommendations: React.FC = () => {
  const [analysis, setAnalysis] = useState<CalendarAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setGoals] = useState<SmartGoal[]>([]);

  // Новые состояния для улучшенного дизайна
  const [viewMode, setViewMode] = useState<ViewMode>('selection');
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [tomorrowData, setTomorrowData] = useState<DayData | null>(null);

  // Состояние для модального окна предупреждения о целях
  const [showGoalsWarning, setShowGoalsWarning] = useState(false);
  const [pendingMode, setPendingMode] = useState<'week' | 'tomorrow' | null>(null);

  // Функция создания временных слотов
  const createTimeSlots = (date: Date, events: CalendarEvent[]): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const dayEvents = events.filter(event => {
      const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
      return eventDate.toDateString() === date.toDateString();
    });

    for (let hour = 6; hour < 23; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const slotEvents = dayEvents.filter(event => {
        const eventStart = new Date(event.start?.dateTime || event.start?.date || '');
        return eventStart.getHours() === hour;
      });

      const isFree = slotEvents.length === 0;
      const isOptimal = isFree && ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16));

      slots.push({
        time: timeStr,
        events: slotEvents,
        isFree,
        isOptimal,
        suggestion: isOptimal ? 'Оптимальное время для важных задач' : undefined
      });
    }

    return slots;
  };

  // Функция создания данных дня
  const createDayData = (date: Date, events: CalendarEvent[]): DayData => {
    const timeSlots = createTimeSlots(date, events);
    const dayEvents = events.filter(event => {
      const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
      return eventDate.toDateString() === date.toDateString();
    });

    return {
      date,
      dateStr: date.toLocaleDateString('ru-RU'),
      dayName: date.toLocaleDateString('ru-RU', { weekday: 'long' }),
      timeSlots,
      totalEvents: dayEvents.length,
      freeHours: timeSlots.filter(slot => slot.isFree).length,
      optimalSlots: timeSlots.filter(slot => slot.isOptimal).length
    };
  };

  // Функция создания данных недели
  const createWeekData = (startDate: Date, events: CalendarEvent[]): WeekData => {
    const days: DayData[] = [];
    let totalFreeHours = 0;
    let busyDays = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dayData = createDayData(date, events);
      days.push(dayData);
      totalFreeHours += dayData.freeHours;
      if (dayData.totalEvents > 0) busyDays++;
    }

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    return {
      days,
      weekRange: `${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}`,
      totalFreeHours,
      busyDays
    };
  };

  // Обработчик выбора режима
  const handleModeSelect = async (mode: 'week' | 'tomorrow') => {
    // Для режимов week и tomorrow сначала проверяем наличие целей
    try {
      console.log(`🔍 Checking goals for ${mode} mode...`);
      const goalsData = await aiService.getGoals(true).catch(() => []);

      if (!Array.isArray(goalsData) || goalsData.length === 0) {
        console.log('❌ No goals found, showing warning modal');
        setPendingMode(mode);
        setShowGoalsWarning(true);
        return;
      }
    } catch (error) {
      console.error('❌ Error checking goals:', error);
      setPendingMode(mode);
      setShowGoalsWarning(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // НОВЫЙ ПОДХОД: Загружаем существующие события календаря и анализируем их
      console.log(`🎯 Analyzing existing calendar events for ${mode} to find free slots...`);

      // 1. Загружаем цели пользователя
      const goalsData = await aiService.getGoals(true).catch(() => []);

      if (!Array.isArray(goalsData) || goalsData.length === 0) {
        setError('Для анализа календаря необходимо добавить цели. Перейдите в раздел "Цели" и создайте хотя бы одну цель.');
        setLoading(false);
        return;
      }

      setGoals(goalsData);

      // 2. Загружаем существующие события календаря
      console.log('📅 Loading existing calendar events...');
      let calendarEvents: CalendarEvent[] = [];

      try {
        calendarEvents = await calendarService.getEvents(false, true);
        console.log(`�� Loaded ${calendarEvents.length} calendar events for analysis`);
      } catch (calendarError) {
        console.error('❌ Error loading calendar events:', calendarError);
        // Продолжаем без календарных событий
        calendarEvents = [];
      }

      // 3. Фильтруем события по периоду анализа
      const now = new Date();
      let filteredEvents: CalendarEvent[] = [];

      if (mode === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);

        filteredEvents = calendarEvents.filter(event => {
          const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
          return eventDate >= tomorrowStart && eventDate <= tomorrowEnd;
        });

        console.log(`📅 Filtered to ${filteredEvents.length} events for tomorrow`);
      } else if (mode === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() + 1); // начинаем с завтра
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // 7 дней включая завтра

        filteredEvents = calendarEvents.filter(event => {
          const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
          return eventDate >= weekStart && eventDate <= weekEnd;
        });

        console.log(`📅 Filtered to ${filteredEvents.length} events for the week`);
      }

      // 4. Создаем объект запроса для анализа календаря с существующими событиями
      const analysisRequest = {
        calendar_events: filteredEvents, // Отправляем реальные события календаря
        user_goals: goalsData,
        analysis_period_days: mode === 'tomorrow' ? 1 : 7,
        analysis_type: mode
      };

      // НОВОЕ: Детальное логирование запроса для отладки
      console.log(`🤖 Requesting AI to analyze existing calendar and find free slots...`);
      console.log('📋 Detailed analysis request:', {
        calendar_events_count: filteredEvents.length,
        user_goals_count: goalsData.length,
        analysis_type: mode,
        analysis_period_days: analysisRequest.analysis_period_days
      });

      // Логируем первые несколько событий для проверки структуры
      if (filteredEvents.length > 0) {
        console.log('📅 Sample calendar events being sent to AI:', {
          first_event: filteredEvents[0],
          events_preview: filteredEvents.slice(0, 3).map(event => ({
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            duration: event.start?.dateTime && event.end?.dateTime ?
              `${new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()} ms` :
              'all-day'
          }))
        });
      } else {
        console.log('⚠️ No calendar events found for the selected period!');
      }

      // 5. НОВОЕ: Проверяем кеш перед запросом к ИИ
      let analysisResult = recommendationsCacheService.getRecommendations(analysisRequest, mode);

      if (analysisResult) {
        console.log(`💾 Using cached AI analysis for ${mode} mode`);
      } else {
        // Отправляем запрос на анализ календаря (НЕ создание полного расписания)
        analysisResult = await aiService.analyzeCalendar(analysisRequest);

        // Сох��аняем результат в кеш
        recommendationsCacheService.setRecommendations(analysisRequest, mode, analysisResult);

        console.log(`✅ Calendar analysis completed and cached for ${mode} mode:`, analysisResult);
      }

      // 6. Создаем данные для отображения на основе существующих событий и рекомендаций
      if (mode === 'week') {
        // Создаем данные недели на основе существующих событий
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() + 1);
        const weekData = createWeekData(startOfWeek, filteredEvents);
        setWeekData(weekData);
        setViewMode('week');
      } else {
        // Для завтрашн��го дня
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowData = createDayData(tomorrow, filteredEvents);
        setTomorrowData(tomorrowData);
        setViewMode('tomorrow');
      }

      // 7. Сохраняем результаты анализа
      setAnalysis(analysisResult);

    } catch (err: any) {
      console.error('❌ Error analyzing calendar:', err);
      setError(`Ошибка анализа календаря: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Функция для создания данных недели из созданного расписания
  const createWeekDataFromSchedule = (schedules: any[]): WeekData => {
    const days: DayData[] = [];
    let totalFreeHours = 0;
    let busyDays = 0;

    schedules.forEach((schedule, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);

      const dayData = createDayDataFromSchedule(schedule, date);
      days.push(dayData);
      totalFreeHours += dayData.freeHours;
      if (dayData.totalEvents > 0) busyDays++;
    });

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 6);

    return {
      days,
      weekRange: `${startDate.toLocaleDateString('ru-RU')} - ${endDate.toLocaleDateString('ru-RU')}`,
      totalFreeHours,
      busyDays
    };
  };

  // Функция для создания данных дня из созданного расписания
  const createDayDataFromSchedule = (schedule: any, date?: Date): DayData => {
    const dayDate = date || new Date(schedule.date);
    const events = schedule.events || [];

    // Создаем временные слоты с учетом созданных событий
    const slots: TimeSlot[] = [];
    for (let hour = 6; hour < 23; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      const slotEvents = events.filter((event: any) => {
        const eventStart = new Date(event.start_time);
        return eventStart.getHours() === hour;
      }).map((event: any) => ({
        summary: event.title,
        start: { dateTime: event.start_time },
        end: { dateTime: event.end_time }
      }));

      const isFree = slotEvents.length === 0;
      const isOptimal = isFree && ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16));

      slots.push({
        time: timeStr,
        events: slotEvents,
        isFree,
        isOptimal,
        suggestion: isOptimal ? 'Оптимальное ��ремя для новых задач' : undefined
      });
    }

    return {
      date: dayDate,
      dateStr: dayDate.toLocaleDateString('ru-RU'),
      dayName: dayDate.toLocaleDateString('ru-RU', { weekday: 'long' }),
      timeSlots: slots,
      totalEvents: events.length,
      freeHours: slots.filter(slot => slot.isFree).length,
      optimalSlots: slots.filter(slot => slot.isOptimal).length
    };
  };

  // Функция для конвертации расписаний в изменения для отображения
  const convertSchedulesToChanges = (schedules: any[]): ScheduleChange[] => {
    const changes: ScheduleChange[] = [];

    schedules.forEach(schedule => {
      if (schedule.events) {
        schedule.events.forEach((event: any, index: number) => {
          changes.push({
            id: `schedule-${schedule.date}-${index}`,
            action: 'create',
            title: event.title,
            reason: event.description || `Запланировано для достижения цели: ${event.goal_id || 'общая прод��ктивность'}`,
            new_start: event.start_time,
            new_end: event.end_time,
            priority: event.priority || 'medium',
            description: event.description,
            is_new_event: true
          });
        });
      }
    });

    return changes;
  };

  // Обработчики действий
  const handleApplyChange = async (change: ScheduleChange) => {
    console.log('Applying change:', change);
    // Здесь будет логика применения изменений к календарю
  };

  const handleRejectChange = (change: ScheduleChange) => {
    console.log('Rejecting change:', change);
    // Зде��ь будет логика отклонения изменений
  };

  const handleApplySuggestion = (time: string, suggestion: string) => {
    console.log('Applying suggestion:', time, suggestion);
    // Здесь будет логика применения предложения
  };

  // Новые обработчики для событий ИИ
  const handleCreateEvent = async (change: ScheduleChange) => {
    try {
      setLoading(true);

      // Подготавливаем данные для создания события
      const eventData = {
        summary: change.title,
        description: change.description || change.reason,
        start: {
          dateTime: change.new_start!,
          timeZone: 'Europe/Moscow'
        },
        end: {
          dateTime: change.new_end!,
          timeZone: 'Europe/Moscow'
        },
        location: change.location,
        ...(change.recurrence?.rrule && {
          recurrence: [change.recurrence.rrule]
        })
      };

      console.log('🆕 Creating new event from AI recommendation:', eventData);

      // Создаем событие через API
      const result = await aiService.createCalendarEvent(eventData);

      if (result.status === 'success') {
        // Удаляем это изменение из отображения
        setAnalysis(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            schedule_changes: prev.schedule_changes.filter(c => c.id !== change.id)
          };
        });

        // НОВОЕ: Инвалидируем кеш после создания события
        recommendationsCacheService.clearAllRecommendations();
        console.log('��� Cache invalidated after creating new event');

        // Показываем успешное сообщение
        alert('✅ Событие успешно добавлено в календарь!');

        // Перезагружаем данные календаря для обновления timeline
        const eventsData = await calendarService.getEvents(false,true);
        if (viewMode === 'tomorrow') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const updatedTomorrowData = createDayData(tomorrow, eventsData);
          setTomorrowData(updatedTomorrowData);
        } else if (viewMode === 'week') {
          const startOfWeek = new Date();
          startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
          const updatedWeekData = createWeekData(startOfWeek, eventsData);
          setWeekData(updatedWeekData);
        }
      }
    } catch (error: any) {
      console.error('❌ Error creating event:', error);
      alert(`❌ Ошибка при создании события: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectEvent = async (change: ScheduleChange) => {
    try {
      console.log('❌ Rejecting AI event recommendation:', change.id);

      // Отклоняем рекомендацию через AI сервис
      await aiService.rejectScheduleChange(change.id, viewMode as 'week' | 'tomorrow' | 'general');

      // Удаляем это изменение из отображения
      setAnalysis(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          schedule_changes: prev.schedule_changes.filter(c => c.id !== change.id)
        };
      });

      console.log('✅ AI recommendation rejected and removed from display');
    } catch (error: any) {
      console.error('❌ Error rejecting event:', error);
      alert(`❌ Ошибка при отклонении: ${error.message}`);
    }
  };

  // Обработчики для модального окна предупреждения о целях
  const handleGoalsWarningClose = () => {
    setShowGoalsWarning(false);
    setPendingMode(null);
  };

  const handleGoToGoals = () => {
    setShowGoalsWarning(false);
    setPendingMode(null);
    // Переходим к разделу целей
    window.location.href = '/goals';
  };

  const handleBackToSelection = () => {
    setViewMode('selection');
    setAnalysis(null);
    setWeekData(null);
    setTomorrowData(null);
  };

  // Рендер загрузки
  if (loading) {
    return (
      <div className="recommendations-container">
        <div className="loading-screen">
          <div className="ai-brain">🤖</div>
          <h2>AI анализирует ваш календарь...</h2>
          <div className="loading-steps">
            <div className="step active"> Загрузка событий</div>
            <div className="step active"> Анализ целей</div>
            <div className="step active">⚡ Создание рекомендаций</div>
          </div>
        </div>
      </div>
    );
  }

  // Рендер ошибки
  if (error) {
    return (
      <div className="recommendations-container">
        <div className="error-screen">
          <div className="error-icon">❌</div>
          <h2>Произошла ошибка</h2>
          <p>{error}</p>
          <button className="retry-btn" onClick={() => setViewMode('selection')}>
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // Основной рендер
  return (
    <div className="recommendations-container">
      {viewMode === 'selection' && (
        <AnalysisSelector onSelectMode={handleModeSelect} />
      )}

      {viewMode === 'week' && weekData && (
        <div className="week-container">
          <button className="back-btn" onClick={handleBackToSelection}>
            ← Назад к выбору
          </button>
          <WeekView
            weekData={weekData}
            recommendations={analysis?.recommendations || []}
            scheduleChanges={analysis?.schedule_changes || []}
            onApplyChange={handleApplyChange}
            onRejectChange={handleRejectChange}
            onCreateEvent={handleCreateEvent}
            onRejectEvent={handleRejectEvent}
          />
        </div>
      )}

      {viewMode === 'tomorrow' && tomorrowData && (
        <div className="tomorrow-container">
          <button className="back-btn" onClick={handleBackToSelection}>
            ← Назад к выбору
          </button>
          <div className="tomorrow-header">
            <h2>📅 Анализ календаря на завтра</h2>
            <p className="tomorrow-subtitle">
              {tomorrowData.dateStr} - {tomorrowData.dayName}
            </p>
          </div>

          {/* Статистика дня */}
          <div className="tomorrow-stats">
            <div className="stat-card">
              <span className="stat-number">{tomorrowData.totalEvents}</span>
              <span className="stat-label">событий</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{tomorrowData.freeHours}</span>
              <span className="stat-label">часов свободно</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{tomorrowData.optimalSlots}</span>
              <span className="stat-label">оптимальных слотов</span>
            </div>
          </div>

          {/* Timeline */}
          <TimelineView
            dayData={tomorrowData}
            showSuggestions={true}
            onApplySuggestion={handleApplySuggestion}
          />

          {/* AI Рекомендации */}
          {analysis?.recommendations && analysis.recommendations.length > 0 && (
            <div className="recommendations-section">
              <h3>🤖 AI Рекомендации на завтра</h3>
              <div className="recommendations-grid">
                {analysis.recommendations.map((rec, index) => (
                  <div key={index} className="recommendation-card-new">
                    <div className="rec-icon">💡</div>
                    <p>{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Предлагаемые изменения */}
          {analysis?.schedule_changes && analysis.schedule_changes.length > 0 && (
            <div className="changes-section">
              <h3>⚡ Предлагаемые изменения</h3>
              <div className="changes-grid">
                {analysis.schedule_changes.map((change, index) => (
                  <ScheduleChangeCardNew
                    key={index}
                    change={change}
                    onApply={() => handleApplyChange(change)}
                    onReject={() => handleRejectChange(change)}
                    onCreateEvent={handleCreateEvent}
                    onRejectEvent={handleRejectEvent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Если нет рекомендаций */}
          {(!analysis?.recommendations || analysis.recommendations.length === 0) &&
           (!analysis?.schedule_changes || analysis.schedule_changes.length === 0) && (
            <div className="no-recommendations">
              <div className="no-rec-icon">🎯</div>
              <h3>Отличное планирование!</h3>
              <p>Ваш завтраш��ий день хорошо организован. AI не нашел критических изменений для улучшения.</p>
            </div>
          )}
        </div>
      )}

      {/* Модал��ное окно предупреждения о целях */}
      {showGoalsWarning && pendingMode && (
        <GoalsWarningModal
          isOpen={showGoalsWarning}
          mode={pendingMode}
          onClose={handleGoalsWarningClose}
          onGoToGoals={handleGoToGoals}
        />
      )}
    </div>
  );
};

export default Recommendations;
