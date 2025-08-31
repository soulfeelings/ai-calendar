import React, { useState, useEffect } from 'react';
import { aiService, CalendarAnalysis, SmartGoal, ScheduleChange } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import './Recommendations.css';

interface RecommendationCardProps {
  recommendation: string;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  return (
    <div className="recommendation-card">
      <div className="recommendation-content">
        <span className="recommendation-text">{recommendation}</span>
      </div>
    </div>
  );
};

interface ScheduleChangeCardProps {
  change: ScheduleChange;
  onApply: () => void;
  onReject: () => void;
  isApplying: boolean;
}

const ScheduleChangeCard: React.FC<ScheduleChangeCardProps> = ({ 
  change, 
  onApply,
  onReject,
  isApplying
}) => {
  const formatDateTime = (dateTimeStr: string) => {
    try {
      return new Date(dateTimeStr).toLocaleString('ru-RU');
    } catch {
      return dateTimeStr;
    }
  };

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

  const getActionLabel = (action: string) => {
    switch (action.toLowerCase()) {
      case 'move': return 'Перенести';
      case 'reschedule': return 'Перепланировать';
      case 'cancel': return 'Отменить';
      case 'optimize': return 'Оптимизировать';
      case 'create': return 'Создать';
      default: return action;
    }
  };

  return (
    <div className="schedule-change-card">
      <div className="change-header">
        <div className="change-title">
          <span className="action-icon">{getActionIcon(change.action)}</span>
          <h4>{change.title}</h4>
        </div>
        <span className={`action-badge ${change.action.toLowerCase()}`}>
          {getActionLabel(change.action)}
        </span>
      </div>

      <div className="change-body">
        <p className="change-reason">{change.reason}</p>

        {change.new_start && (
          <div className="change-detail">
            <strong>Новое начало:</strong> {formatDateTime(change.new_start)}
          </div>
        )}

        {change.new_end && (
          <div className="change-detail">
            <strong>Новый конец:</strong> {formatDateTime(change.new_end)}
          </div>
        )}

        {change.priority && (
          <div className="change-priority">
            <span className={`priority-badge ${change.priority}`}>
              {change.priority === 'high' ? '🔴 Высокий' :
               change.priority === 'medium' ? '🟡 Средний' : '🟢 Низкий'}
            </span>
          </div>
        )}
      </div>
      
      <div className="change-actions">
        <button 
          onClick={onApply}
          className="apply-button"
          disabled={isApplying}
        >
          {isApplying ? '⏳ Применяется...' : '✅ Применить'}
        </button>
        <button 
          onClick={onReject}
          className="reject-button"
          disabled={isApplying}
        >
          ❌ Отклонить
        </button>
      </div>
    </div>
  );
};

const Recommendations: React.FC = () => {
  const [analysis, setAnalysis] = useState<CalendarAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [goals, setGoals] = useState<SmartGoal[]>([]);
  const [appliedChanges, setAppliedChanges] = useState<Set<number>>(new Set());
  const [rejectedChanges, setRejectedChanges] = useState<Set<number>>(new Set());
  const [applyingChange, setApplyingChange] = useState<number | null>(null);

  // Загрузка событий из localStorage или с бэкенда
  const loadEvents = async (): Promise<CalendarEvent[]> => {
    try {
      // Сначала проверяем localStorage
      const cachedEvents = localStorage.getItem('calendar_events');

      if (cachedEvents) {
        console.log('Loading events from localStorage');
        const parsedEvents = JSON.parse(cachedEvents);

        // Проверяем, что в localStorage - массив или объект Google Calendar
        let eventsArray: CalendarEvent[];
        if (Array.isArray(parsedEvents)) {
          // Если это массив событий - используем как есть
          eventsArray = parsedEvents;
        } else if (parsedEvents && typeof parsedEvents === 'object' && parsedEvents.items) {
          // Если это объект Google Calendar - извлекаем массив items
          console.log('Found Google Calendar object in localStorage, extracting items');
          eventsArray = parsedEvents.items;
          // Обновляем localStorage чтобы хранить только массив событий
          localStorage.setItem('calendar_events', JSON.stringify(eventsArray));
        } else {
          // Неожиданный формат - очищаем и загружаем заново
          console.warn('Unexpected format in localStorage, clearing cache');
          localStorage.removeItem('calendar_events');
          eventsArray = [];
        }

        if (eventsArray.length > 0) {
          setEvents(eventsArray);
          return eventsArray;
        }
      }

      // Если в localStorage нет событий, запрашиваем с бэкенда
      console.log('No events in localStorage, fetching from backend');
      const eventsFromBackend = await calendarService.getEvents(true); // forcefullsync=true

      // Сохраняем в localStorage (только массив событий)
      localStorage.setItem('calendar_events', JSON.stringify(eventsFromBackend));
      setEvents(eventsFromBackend);
      return eventsFromBackend;

    } catch (error) {
      console.error('Error loading events:', error);
      throw error;
    }
  };

  // Загрузка целей пользователя
  const loadGoals = async (): Promise<SmartGoal[]> => {
    try {
      // Загружаем цели отдельно с более детальной обработкой ошибок
      try {
        const goalsData = await aiService.getGoals();

        // Проверяем, что goalsData это массив
        if (Array.isArray(goalsData)) {
          setGoals(goalsData);
          return goalsData;
        } else {
          console.warn('Goals data is not an array:', goalsData);
          setGoals([]);
          return [];
        }
      } catch (goalsError) {
        console.warn('Failed to load goals, continuing without them:', goalsError);
        setGoals([]);
        return [];
      }
    } catch (error) {
      console.error('Error loading goals:', error);
      return [];
    }
  };

  // Получение анализа календаря
  const getCalendarAnalysis = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      // Загружаем события и цели
      const [eventsList, goalsList] = await Promise.all([
        loadEvents(),
        loadGoals()
      ]);

      if (!eventsList || eventsList.length === 0) {
        setError('Нет событий для анализа');
        return;
      }

      // Отправляем события на анализ ИИ с возможностью принудительного обновления
      const analysisResult = await aiService.analyzeCalendar({
        calendar_events: eventsList,
        user_goals: goalsList,
        analysis_period_days: 7
      }, forceRefresh);

      setAnalysis(analysisResult);

    } catch (err: any) {
      console.error('Error getting calendar analysis:', err);
      setError(err.message || 'Произошла ошибка при анализе календаря');
    } finally {
      setLoading(false);
    }
  };

  // Применение изменения в расписании
  const applyScheduleChange = async (change: ScheduleChange, index: number) => {
    setApplyingChange(index);

    try {
      if (change.action === 'create') {
        // Создание нового события - пока что просто помечаем как применено
        console.log('Creating event:', change);
      } else if (change.action === 'update' && change.id) {
        // Обновление существующего события
        await aiService.updateCalendarEvent(change.id, {
          summary: change.title,
          description: change.reason,
          start: change.new_start ? { dateTime: change.new_start } : undefined,
          end: change.new_end ? { dateTime: change.new_end } : undefined
        });
      }

      // Помечаем изменение как примененное
      setAppliedChanges(prev => {
        const newSet = new Set(prev);
        newSet.add(index);
        return newSet;
      });

      // Обновляем события после применения изменения
      await loadEvents();

    } catch (error: any) {
      console.error('Error applying schedule change:', error);
      alert(`Ошибка при применении изменения: ${error.message}`);
    } finally {
      setApplyingChange(null);
    }
  };

  // Отклонение изменения
  const rejectScheduleChange = (index: number) => {
    setRejectedChanges(prev => {
      const newSet = new Set(prev);
      newSet.add(index);
      return newSet;
    });
  };

  // Очистка кеша
  const clearCache = () => {
    localStorage.removeItem('calendar_events');
    console.log('Cache cleared');
    alert('Кеш очищен. Нажмите "Обновить анализ" для загрузки свежих данных.');
  };

  // Очистка кеша ИИ
  const clearAICache = () => {
    aiService.clearAICache();
    console.log('AI cache cleared');
    alert('Кеш ИИ очищен. Нажмите "Обновить анализ" для получения свежих рекомендаций.');
  };

  // Получение информации о кеше
  const getCacheInfo = () => {
    const cacheInfo = aiService.getCacheInfo();
    console.log('Cache info:', cacheInfo);

    const sizeInKB = (cacheInfo.totalSize / 1024).toFixed(2);
    const message = `Кеш ИИ содержит ${cacheInfo.totalEntries} записей, размер: ${sizeInKB} КБ`;
    alert(message);
  };

  // Загружаем анализ при монтировании компонента
  useEffect(() => {
    getCalendarAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="recommendations-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Анализируем ваш календарь...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recommendations-container">
        <div className="error-message">
          <h3>⚠️ Ошибка</h3>
          <p>{error}</p>
          <button onClick={() => getCalendarAnalysis()} className="retry-button">
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="recommendations-container">
        <p>Нет данных для отображения</p>
        <button onClick={() => getCalendarAnalysis()} className="retry-button">
          Загрузить анализ
        </button>
      </div>
    );
  }

  return (
    <div className="recommendations-container">
      <header className="recommendations-header">
        <h2>📊 Анализ календаря</h2>
        <div className="header-buttons">
          <button onClick={() => getCalendarAnalysis(false)} className="refresh-button">
            🔄 Обновить анализ
          </button>
          <button onClick={() => getCalendarAnalysis(true)} className="refresh-button force-refresh">
            ⚡ Принудительное обновление
          </button>
          <button onClick={clearCache} className="clear-cache-button">
            🗑️ Очистить кеш событий
          </button>
          <button onClick={clearAICache} className="clear-cache-button ai-cache">
            🧠 Очистить кеш ИИ
          </button>
          <button onClick={getCacheInfo} className="info-button">
            ℹ️ Инфо кеша
          </button>
        </div>
      </header>

      {/* Краткое резюме */}
      <div className="summary-section">
        <h3>📝 Общий анализ</h3>
        <p>{analysis.summary}</p>

        {analysis.productivity_score && (
          <div className="productivity-score">
            <strong>Оценка продуктивности:</strong> {analysis.productivity_score}/10
          </div>
        )}

        {analysis.goal_alignment && (
          <div className="goal-alignment">
            <strong>Соответствие целям:</strong> {analysis.goal_alignment}
          </div>
        )}
      </div>

      {/* Общие рекомендации */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h3>💡 Рекомендации</h3>
          <div className="recommendations-list">
            {analysis.recommendations.map((recommendation: string, index: number) => (
              <RecommendationCard
                key={index}
                recommendation={recommendation}
              />
            ))}
          </div>
        </div>
      )}

      {/* Предлагаемые изменения расписания */}
      {analysis.schedule_changes && analysis.schedule_changes.length > 0 && (
        <div className="schedule-changes-section">
          <h3>📅 Предлагаемые изменения</h3>
          <div className="schedule-changes-list">
            {analysis.schedule_changes.map((change: ScheduleChange, index: number) => {
              if (appliedChanges.has(index) || rejectedChanges.has(index)) {
                return null;
              }

              return (
                <ScheduleChangeCard
                  key={index}
                  change={change}
                  onApply={() => applyScheduleChange(change, index)}
                  onReject={() => rejectScheduleChange(index)}
                  isApplying={applyingChange === index}
                />
              );
            })}
          </div>

          {appliedChanges.size > 0 && (
            <div className="applied-changes">
              <h4>✅ Примененные изменения: {appliedChanges.size}</h4>
            </div>
          )}

          {rejectedChanges.size > 0 && (
            <div className="rejected-changes">
              <h4>❌ Отклоненные изменения: {rejectedChanges.size}</h4>
            </div>
          )}
        </div>
      )}

      {/* Статистика */}
      <div className="events-stats">
        <h3>📈 Статистика</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-value">{events.length}</span>
            <span className="stat-label">Событий</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{goals.length}</span>
            <span className="stat-label">Целей</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{analysis.schedule_changes?.length || 0}</span>
            <span className="stat-label">Предложений</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Recommendations;
