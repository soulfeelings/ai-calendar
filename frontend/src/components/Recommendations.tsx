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
  // Храним идентификаторы изменений (а не индексы) и персистим их в localStorage
  const [appliedChanges, setAppliedChanges] = useState<Set<string>>(new Set());
  const [rejectedChanges, setRejectedChanges] = useState<Set<string>>(new Set());
  const [applyingChange, setApplyingChange] = useState<number | null>(null);

  // Ключи в localStorage для персистентности
  const APPLIED_KEY = 'ai_applied_schedule_change_ids';
  const REJECTED_KEY = 'ai_rejected_schedule_change_ids';

  // Генерируем стабильный ключ изменения: используем id, иначе хеш от содержимого
  const getChangeKey = (change: ScheduleChange): string => {
    if (change.id) return change.id;
    const payload = `${change.action}|${change.title}|${change.reason}|${change.new_start || ''}|${change.new_end || ''}|${change.priority || ''}`;
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      const chr = payload.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return `gen_${Math.abs(hash).toString(36)}`;
  };

  // Загрузка/сохранение списков обработанных изменений
  const loadHandledChanges = () => {
    try {
      const appliedRaw = localStorage.getItem(APPLIED_KEY);
      const rejectedRaw = localStorage.getItem(REJECTED_KEY);
      setAppliedChanges(new Set(appliedRaw ? JSON.parse(appliedRaw) : []));
      setRejectedChanges(new Set(rejectedRaw ? JSON.parse(rejectedRaw) : []));
    } catch (e) {
      console.warn('Failed to load handled changes from localStorage', e);
      setAppliedChanges(new Set());
      setRejectedChanges(new Set());
    }
  };

  const persistHandledChanges = (applied: Set<string>, rejected: Set<string>) => {
    try {
      localStorage.setItem(APPLIED_KEY, JSON.stringify([...applied]));
      localStorage.setItem(REJECTED_KEY, JSON.stringify([...rejected]));
    } catch (e) {
      console.warn('Failed to persist handled changes to localStorage', e);
    }
  };

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

    const key = getChangeKey(change);

    try {
      // Вызываем бэкенд только если можем однозначно применить
      if ((change.action === 'update' || change.action?.toLowerCase() === 'reschedule' || change.action?.toLowerCase() === 'move' || change.action?.toLowerCase() === 'optimize') && change.id) {
        await aiService.updateCalendarEvent(change.id, {
          summary: change.title,
          description: change.reason,
          start: change.new_start ? { dateTime: change.new_start } : undefined,
          end: change.new_end ? { dateTime: change.new_end } : undefined
        });
      } else if (change.action?.toLowerCase() === 'cancel') {
        // Для отмены требуется endpoint удаления; пока помечаем как применено локально
        console.warn('Cancel action is not implemented on backend DELETE endpoint; marking as applied locally');
      } else if (change.action?.toLowerCase() === 'create') {
        // Для создания требуется endpoint создания; пока помечаем как применено локально
        console.warn('Create action is not implemented on backend POST endpoint; marking as applied локально');
      }

      // Помечаем изменение как применённое и персистим
      setAppliedChanges(prev => {
        const next = new Set(prev);
        next.add(key);
        persistHandledChanges(next, rejectedChanges);
        return next;
      });

      // Обновляем события после применения изменения
      await loadEvents();

    } catch (error: any) {
      console.error('Error applying schedule change:', error);
      alert(`Ошибка при применении изменения: ${error.message || error}`);
    } finally {
      setApplyingChange(null);
    }
  };

  // Отклонение изменения
  const rejectScheduleChange = (change: ScheduleChange) => {
    const key = getChangeKey(change);
    setRejectedChanges(prev => {
      const next = new Set(prev);
      next.add(key);
      persistHandledChanges(appliedChanges, next);
      return next;
    });
  };

  // Обновление анализа календаря (очистка кеша + новый запрос)
  const refreshCalendarAnalysis = async () => {
    aiService.clearAICache();
    // Сбрасываем локальные пометки, если нужен полный пересчёт
    // При необходимости можно оставить, чтобы скрывать даже после обновления
    await getCalendarAnalysis(true);
  };


  // Загружаем анализ при монтировании компонента
  useEffect(() => {
    loadHandledChanges();
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
          <button onClick={refreshCalendarAnalysis} className="refresh-button">
            🔄 Обновить анализ календаря
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
              const key = getChangeKey(change);
              if (appliedChanges.has(key) || rejectedChanges.has(key)) {
                return null;
              }

              return (
                <ScheduleChangeCard
                  key={key}
                  change={change}
                  onApply={() => applyScheduleChange(change, index)}
                  onReject={() => rejectScheduleChange(change)}
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
