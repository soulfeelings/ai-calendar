import React, { useState } from 'react';
import { aiService, CalendarAnalysis, SmartGoal, ScheduleChange } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import recommendationsCacheService from '../services/recommendationsCacheService';
import './Recommendations.css';

// Типы для нового дизайна
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
  const [generalAnalysisLoading, setGeneralAnalysisLoading] = useState(false);
  const [generalAnalysisResult, setGeneralAnalysisResult] = useState<CalendarAnalysis | null>(null);

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

  // Функция для фильтрации актуальных событий
  const filterRelevantEvents = (events: any[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Сбрасываем время к началу дня

    return events.filter(event => {
      // Проверяем дату окончания события
      let endDate: Date;

      if (event.end?.dateTime) {
        endDate = new Date(event.end.dateTime);
      } else if (event.end?.date) {
        endDate = new Date(event.end.date);
      } else if (event.start?.dateTime) {
        // Если нет end, используем start как приблизительную дату
        endDate = new Date(event.start.dateTime);
      } else if (event.start?.date) {
        endDate = new Date(event.start.date);
      } else {
        return false; // Событие без даты - пропускаем
      }

      // Событие актуально, если дата окончания >= сегодня
      return endDate >= today;
    });
  };

  // Обработчик общего анализа календаря
  const handleGeneralAnalysis = async () => {
    setGeneralAnalysisLoading(true);
    setGeneralAnalysisResult(null);

    try {
      console.log('🔍 Starting general calendar analysis...');

      // Загружаем со��ытия и цели
      const [eventsData, goalsData] = await Promise.all([
        calendarService.getEvents(true),
        aiService.getGoals(true).catch(() => [])
      ]);

      // Фильтруем только актуальные события
      const relevantEvents = filterRelevantEvents(eventsData);

      console.log(`📅 Filtered ${relevantEvents.length} relevant events from ${eventsData.length} total events`);

      // Создаем объект запроса для общего анализа
      const requestData = {
        calendar_events: relevantEvents,
        user_goals: Array.isArray(goalsData) ? goalsData : [],
        analysis_period_days: 30, // Анализируем на месяц вперед
        analysis_type: 'general' as const
      };

      // Выполняем общий анализ календаря
      const analysisResult = await aiService.analyzeCalendar(requestData);

      console.log('✅ General analysis completed:', analysisResult);
      setGeneralAnalysisResult(analysisResult);

    } catch (error: any) {
      console.error('❌ Error in general analysis:', error);
      alert(`❌ Ошибка п��и общем анализе календаря: ${error.message}`);
    } finally {
      setGeneralAnalysisLoading(false);
    }
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
              📦 Кешировано: {cacheInfo.total} анал��зов
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
          <h3>Новое расписание на неделю</h3>
          <p>ИИ создаст полное расписание на неделю исходя из ваших целей</p>
          <div className="mode-features">
            <span>• Соз��ание с нуля на основе целей</span>
            <span>• Опт��мальное распределение времени</span>
            <span>• Учет приоритетов и дедлайнов</span>
            <span>• Без привязки к текущему календарю</span>
          </div>
          <div className="mode-cta">Создать новое расписание →</div>
        </div>

        <div
          className="mode-card tomorrow-card"
          onClick={() => onSelectMode('tomorrow')}
        >
          <div className="mode-icon">🌅</div>
          <h3>Новое расписание на завтра</h3>
          <p>ИИ составит идеальный план на завтра для достижения ваших целей</p>
          <div className="mode-features">
            <span>• Фокус н�� достижении целей</span>
            <span>• Оптимальная последовательность задач</span>
            <span>• Учет продуктивных часов</span>
            <span>• Соз��ание с чистого листа</span>
          </div>
          <div className="mode-cta">Создать план на завтра →</div>
        </div>

        {/* Новая карточка для общего анализа календаря */}
        <div className="mode-card general-card">
          <div className="mode-icon">📊</div>
          <h3>Общий анализ календаря</h3>
          <p>Анализ всех актуальных событий календаря и общие рекомендации по улучшению</p>
          <div className="mode-features">
            <span>• Анализ актуальных событий</span>
            <span>• Общие паттер��ы использования времени</span>
            <span>• Рек��мендаци�� по оптимизации</span>
            <span>• Соответствие целям</span>
          </div>
          <button
            className={`mode-cta ${generalAnalysisLoading ? 'loading' : ''}`}
            onClick={handleGeneralAnalysis}
            disabled={generalAnalysisLoading}
          >
            {generalAnalysisLoading ? '��� Анализирую...' : 'Провести анализ →'}
          </button>
        </div>
      </div>

      {/* Результат общего анализа */}
      {generalAnalysisResult && (
        <div className="general-analysis-result">
          <div className="analysis-header">
            <h3>📊 Результат общего анализа</h3>
            <button
              className="close-analysis-btn"
              onClick={() => setGeneralAnalysisResult(null)}
            >
              ✕
            </button>
          </div>

          <div className="analysis-content">
            {generalAnalysisResult.summary && (
              <div className="analysis-summary">
                <h4>📝 Сводка</h4>
                <p>{generalAnalysisResult.summary}</p>
              </div>
            )}

            {generalAnalysisResult.recommendations && generalAnalysisResult.recommendations.length > 0 && (
              <div className="analysis-recommendations">
                <h4>💡 Рекомендации</h4>
                <div className="recommendations-list">
                  {generalAnalysisResult.recommendations.map((rec, index) => (
                    <div key={index} className="recommendation-item">
                      <span className="rec-bullet">•</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generalAnalysisResult.productivity_score !== undefined && (
              <div className="productivity-score">
                <h4>⚡ Оценка продуктивности</h4>
                <div className="score-display">
                  <span className="score-number">{generalAnalysisResult.productivity_score}%</span>
                  <div className="score-bar">
                    <div
                      className="score-fill"
                      style={{
                        width: `${generalAnalysisResult.productivity_score}%`,
                        backgroundColor: generalAnalysisResult.productivity_score >= 70 ? '#6bcf7f' :
                                       generalAnalysisResult.productivity_score >= 50 ? '#ffd93d' : '#ff6b6b'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            {generalAnalysisResult.goal_alignment && (
              <div className="goal-alignment">
                <h4>🎯 Соответствие целям</h4>
                <p>{generalAnalysisResult.goal_alignment}</p>
              </div>
            )}

            {generalAnalysisResult.schedule_changes && generalAnalysisResult.schedule_changes.length > 0 && (
              <div className="general-changes">
                <h4>⚡ Предлагаемые улучшения</h4>
                <div className="changes-list">
                  {generalAnalysisResult.schedule_changes.map((change, index) => (
                    <div key={index} className="change-item">
                      <div className="change-title">
                        <span className="change-icon">{change.action === 'create' ? '➕' : '🔄'}</span>
                        <strong>{change.title}</strong>
                      </div>
                      <p className="change-reason">{change.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
          <span className="stat">📅 {dayData.totalEvents} соб��тий</span>
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

// Компонент недельного обзора
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
        <h2>📅 Новое расписание на неделю</h2>
        <div className="week-range">{weekData.weekRange}</div>
        <div className="week-summary">
          <div className="summary-card">
            <span className="summary-number">{scheduleChanges.length}</span>
            <span className="summary-label">запланированных задач</span>
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

// Обновленная карточка изменения расписания
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
                <span className="detail-label">���� Начало:</span>
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
                <span className="time-label">Н��вое время начала:</span>
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
          // Кнопки для изменений существующих событий
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
        suggestion: isOptimal ? 'Оптимальное ��ремя для важных задач' : undefined
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
    setLoading(true);
    setError(null);

    try {
      console.log(`🎯 Creating full schedule for ${mode} based on user goals only...`);

      // З��гружаем только цели пользователя (НЕ загружаем события календаря)
      const goalsData = await aiService.getGoals(true).catch(() => []);

      if (!Array.isArray(goalsData) || goalsData.length === 0) {
        setError('Для создания расписания необходимо добавить цели. Перейдите в раздел "Цели" и создайте хотя бы одну цель.');
        setLoading(false);
        return;
      }

      setGoals(goalsData);

      // Создаем объект запроса для создания полного расписания
      const scheduleRequest = {
        schedule_type: mode,
        user_goals: goalsData,
        ignore_existing_events: true, // Игнорируем существующие события
        work_hours_start: '09:00',
        work_hours_end: '18:00',
        break_duration_minutes: 15,
        buffer_between_events_minutes: 10
      };

      console.log(`🤖 Requesting AI to create full ${mode} schedule...`);
      console.log('📋 Request data:', scheduleRequest);

      // Создаем полное расписание с помощью ИИ
      const scheduleResult = await aiService.createFullSchedule(scheduleRequest);

      console.log('✅ Full schedule created:', scheduleResult);

      // Преобразуем результат в формат для отображения
      if (mode === 'week') {
        // Создаем данные недели на основе созданного расписания
        const weekData = createWeekDataFromSchedule(scheduleResult.schedules);
        setWeekData(weekData);
        setViewMode('week');

        // Преобраз��ем результат в формат CalendarAnalysis для совместимости
        const analysisResult = {
          summary: scheduleResult.reasoning || 'Создано новое расписание на основе ваших целей',
          recommendations: scheduleResult.recommendations || [],
          schedule_changes: convertSchedulesToChanges(scheduleResult.schedules),
          productivity_score: scheduleResult.productivity_score,
          goal_alignment: `Адресов��но целей: ${scheduleResult.total_goals_addressed || 0}`
        };
        setAnalysis(analysisResult);
      } else {
        // Для завтрашнего дня
        const tomorrowSchedule = scheduleResult.schedules[0];
        if (tomorrowSchedule) {
          const tomorrowData = createDayDataFromSchedule(tomorrowSchedule);
          setTomorrowData(tomorrowData);
          setViewMode('tomorrow');

          // Преобразуем ��езультат в формат CalendarAnalysis
          const analysisResult = {
            summary: scheduleResult.reasoning || 'Создано новое расписание на завтра на основе ваших целей',
            recommendations: scheduleResult.recommendations || [],
            schedule_changes: convertSchedulesToChanges([tomorrowSchedule]),
            productivity_score: scheduleResult.productivity_score,
            goal_alignment: `Адресовано целей: ${scheduleResult.total_goals_addressed || 0}`
          };
          setAnalysis(analysisResult);
        }
      }
    } catch (err: any) {
      console.error('❌ Error creating full schedule:', err);
      setError(`Ошибка создания расписания: ${err.message}`);
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

  // Обработчик выбора режима
  const handleModeSelectOld = async (mode: 'week' | 'tomorrow') => {
    setLoading(true);
    setError(null);

    try {
      // Загружаем события и цели
      const [eventsData, goalsData] = await Promise.all([
        calendarService.getEvents(true),
        aiService.getGoals(true).catch(() => [])
      ]);

      setGoals(Array.isArray(goalsData) ? goalsData : []);

      // Создаем объект запроса для кеширования
      const requestData = {
        calendar_events: eventsData,
        user_goals: Array.isArray(goalsData) ? goalsData : [],
        analysis_period_days: mode === 'week' ? 7 : 1,
        analysis_type: mode
      };

      // Проверяем кеш сначала
      console.log(`🔍 Checking cache for ${mode} analysis...`);
      const cachedAnalysis = recommendationsCacheService.getRecommendations(requestData, mode);

      if (cachedAnalysis) {
        console.log(`📋 Using cached ${mode} analysis`);
        setAnalysis(cachedAnalysis);

        // Продолжаем с UI логикой
        if (mode === 'week') {
          const startOfWeek = new Date();
          startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
          const weekData = createWeekData(startOfWeek, eventsData);
          setWeekData(weekData);
          setViewMode('week');
        } else {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowData = createDayData(tomorrow, eventsData);
          setTomorrowData(tomorrowData);
          setViewMode('tomorrow');
        }

        setLoading(false);
        return;
      }

      // Если кеша нет, запрашиваем у AI
      console.log(`🤖 Requesting fresh ${mode} analysis from AI...`);

      if (mode === 'week') {
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
        const weekData = createWeekData(startOfWeek, eventsData);
        setWeekData(weekData);
        setViewMode('week');

        // Получаем анализ от AI
        const analysisResult = await aiService.analyzeCalendar(requestData);

        // Кешируем результат с TTL для недели (7 дней)
        recommendationsCacheService.setRecommendations(requestData, analysisResult, 'week');

        setAnalysis(analysisResult);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowData = createDayData(tomorrow, eventsData);
        setTomorrowData(tomorrowData);
        setViewMode('tomorrow');

        // Получаем анализ от AI для завтрашнего дня
        const analysisResult = await aiService.analyzeCalendar(requestData);

        // Кешируем результат с TTL для завтра (24 часа)
        recommendationsCacheService.setRecommendations(requestData, analysisResult, 'tomorrow');

        setAnalysis(analysisResult);
      }
    } catch (err) {
      setError('Ошибка загрузки данных. Попробуйте позже.');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Обработчики действий
  const handleApplyChange = async (change: ScheduleChange) => {
    console.log('Applying change:', change);
    // Здесь будет логика применения изменений к календарю
  };

  const handleRejectChange = (change: ScheduleChange) => {
    console.log('Rejecting change:', change);
    // Здесь будет логика отклонения изменений
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

      console.log('📅 Creating new event from AI recommendation:', eventData);

      // С��зд��ем событие через API
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

        // Показываем успешное сообщение
        alert('✅ Событие успешно добавлено в календарь!');

        // Перезагр��жаем данные календаря для обновления timeline
        const eventsData = await calendarService.getEvents(true);
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

      // Отклоняем ре��омендацию через AI сервис
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
            <div className="step active">📅 Загрузка событий</div>
            <div className="step active">��� Анализ целей</div>
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
            <h2>🌅 Новое расписание на завтра</h2>
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
              <span className="stat-label">опт��мальных слотов</span>
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
              <p>Ваш завтраш��ий день хорошо организован. AI не нашел кри��ических изменений для улучшения.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Recommendations;
