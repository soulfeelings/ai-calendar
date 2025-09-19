import React, { useState, useEffect } from 'react';
import { aiService, CalendarAnalysis, SmartGoal, ScheduleChange } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import { RRuleParser } from '../utils/rruleParser';
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
  return (
    <div className="analysis-selector">
      <div className="selector-header">
        <h2>🤖 AI Календарь</h2>
        <p>Выберите тип анализа для получения персональных рекомендаций</p>
      </div>

      <div className="mode-cards">
        <div
          className="mode-card week-card"
          onClick={() => onSelectMode('week')}
        >
          <div className="mode-icon">📅</div>
          <h3>Календарь на неделю</h3>
          <p>Полный анализ недели с оптимизацией расписания под ваши цели</p>
          <div className="mode-features">
            <span>• Планирование на 7 дней</span>
            <span>• Балансировка нагрузки</span>
            <span>• Учет биоритмов</span>
          </div>
          <div className="mode-cta">Создать план недели →</div>
        </div>

        <div
          className="mode-card tomorrow-card"
          onClick={() => onSelectMode('tomorrow')}
        >
          <div className="mode-icon">🌅</div>
          <h3>Календарь на завтра</h3>
          <p>Быстрая оптимизация завтрашнего дня для максимальной продуктивности</p>
          <div className="mode-features">
            <span>• Фокус на 1 день</span>
            <span>• Приоритетные задачи</span>
            <span>• Энергетические пики</span>
          </div>
          <div className="mode-cta">Оптимизировать завтра →</div>
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

// Компонент недельного обзора
const WeekView: React.FC<{
  weekData: WeekData;
  recommendations: string[];
  scheduleChanges: ScheduleChange[];
  onApplyChange: (change: ScheduleChange) => void;
  onRejectChange: (change: ScheduleChange) => void;
}> = ({ weekData, recommendations, scheduleChanges, onApplyChange, onRejectChange }) => {
  return (
    <div className="week-view">
      <div className="week-header">
        <h2>📅 Календарь на неделю</h2>
        <div className="week-range">{weekData.weekRange}</div>
        <div className="week-summary">
          <div className="summary-card">
            <span className="summary-number">{weekData.totalFreeHours}</span>
            <span className="summary-label">часов свободно</span>
          </div>
          <div className="summary-card">
            <span className="summary-number">{7 - weekData.busyDays}</span>
            <span className="summary-label">дней для оптимизации</span>
          </div>
          <div className="summary-card">
            <span className="summary-number">{scheduleChanges.length}</span>
            <span className="summary-label">рекомендаций</span>
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
}> = ({ change, onApply, onReject }) => {
  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'move': return '📅';
      case 'reschedule': return '⏰';
      case 'cancel': return '❌';
      case 'optimize': return '⚡';
      case 'create': return '➕';
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

  return (
    <div className="schedule-change-card-new">
      <div className="change-header-new">
        <div className="change-icon">{getActionIcon(change.action)}</div>
        <div className="change-title-new">
          <h4>{change.title}</h4>
          {change.priority && (
            <div
              className="priority-indicator"
              style={{ backgroundColor: getPriorityColor(change.priority) }}
            >
              {change.priority}
            </div>
          )}
        </div>
      </div>

      <div className="change-body-new">
        <p className="change-reason-new">{change.reason}</p>

        {(change.new_start || change.new_end) && (
          <div className="change-time-new">
            {change.new_start && (
              <div className="time-change">
                <span className="time-label">Начало:</span>
                <span className="time-value">
                  {formatDateTime(change.new_start)}
                </span>
              </div>
            )}
            {change.new_end && (
              <div className="time-change">
                <span className="time-label">Конец:</span>
                <span className="time-value">
                  {formatDateTime(change.new_end)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="change-actions-new">
        <button className="apply-btn-new" onClick={onApply}>
          ✅ Применить
        </button>
        <button className="reject-btn-new" onClick={onReject}>
          ❌ Отклонить
        </button>
      </div>
    </div>
  );
};

// Основной компонент Recommendations
const Recommendations: React.FC = () => {
  const [analysis, setAnalysis] = useState<CalendarAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
      const isOptimal = isFree && (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16);

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
    setLoading(true);
    setError(null);

    try {
      // Загружаем события и цели
      const [eventsData, goalsData] = await Promise.all([
        calendarService.getEvents(true),
        aiService.getGoals(true).catch(() => [])
      ]);

      setEvents(eventsData);
      setGoals(Array.isArray(goalsData) ? goalsData : []);

      if (mode === 'week') {
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
        const weekData = createWeekData(startOfWeek, eventsData);
        setWeekData(weekData);
        setViewMode('week');

        // Получаем анализ от AI
        const analysisResult = await aiService.analyzeCalendar(
          eventsData,
          Array.isArray(goalsData) ? goalsData : [],
          7
        );
        setAnalysis(analysisResult);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowData = createDayData(tomorrow, eventsData);
        setTomorrowData(tomorrowData);
        setViewMode('tomorrow');

        // Получаем анализ от AI для завтрашнего дня
        const analysisResult = await aiService.analyzeCalendar(
          eventsData,
          Array.isArray(goalsData) ? goalsData : [],
          1
        );
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
            <div className="step active">🎯 Анализ целей</div>
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
          />
        </div>
      )}

      {viewMode === 'tomorrow' && tomorrowData && (
        <div className="tomorrow-container">
          <button className="back-btn" onClick={handleBackToSelection}>
            ← Назад к выбору
          </button>
          <div className="tomorrow-header">
            <h2>🌅 Оптимизация завтрашнего дня</h2>
          </div>
          <TimelineView
            dayData={tomorrowData}
            showSuggestions={true}
            onApplySuggestion={handleApplySuggestion}
          />

          {analysis?.schedule_changes && analysis.schedule_changes.length > 0 && (
            <div className="changes-section">
              <h3>⚡ Рекомендации на завтра</h3>
              <div className="changes-grid">
                {analysis.schedule_changes.map((change, index) => (
                  <ScheduleChangeCardNew
                    key={index}
                    change={change}
                    onApply={() => handleApplyChange(change)}
                    onReject={() => handleRejectChange(change)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Recommendations;
