import React, { useState, useEffect } from 'react';
import { aiService, CalendarAnalysis, SmartGoal, ScheduleChange, TaskStatus } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import { RRuleParser } from '../utils/rruleParser';
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

// Компонент для отображения статуса задачи
interface TaskProgressProps {
  taskStatus: TaskStatus | null;
  taskType: string;
}

const TaskProgress: React.FC<TaskProgressProps> = ({ taskStatus, taskType }) => {
  if (!taskStatus) return null;

  const getStatusIcon = (state: string) => {
    switch (state) {
      case 'PENDING': return '⏳';
      case 'PROGRESS': return '🔄';
      case 'SUCCESS': return '✅';
      case 'FAILURE': return '❌';
      default: return '⏳';
    }
  };

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'PENDING': return '#ffa500';
      case 'PROGRESS': return '#007bff';
      case 'SUCCESS': return '#28a745';
      case 'FAILURE': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return (
    <div className="task-progress">
      <div className="task-progress-header">
        <span className="task-icon" style={{ color: getStatusColor(taskStatus.state) }}>
          {getStatusIcon(taskStatus.state)}
        </span>
        <span className="task-title">{taskType}</span>
      </div>
      <div className="task-message">{taskStatus.message}</div>
      {taskStatus.progress !== undefined && (
        <div className="task-progress-bar">
          <div
            className="progress-fill"
            style={{
              width: `${taskStatus.progress}%`,
              backgroundColor: getStatusColor(taskStatus.state)
            }}
          />
        </div>
      )}
    </div>
  );
};

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

  // Состояние для отслеживания асинхронных задач
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [useAsyncAnalysis, setUseAsyncAnalysis] = useState(true);

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

  // ВСПОМОГАТЕЛЬНО: поиск исходного события для изменения
  const findEventForChange = (change: ScheduleChange): CalendarEvent | undefined => {
    if (!events || events.length === 0) return undefined;
    // По id
    if (change.id) {
      const byId = events.find(e => e.id === change.id);
      if (byId) return byId;
    }
    // По заголовку (первое совпадение)
    if (change.title) {
      const titleLower = change.title.toLowerCase();
      const byTitle = events.find(e => (e.summary || '').toLowerCase() === titleLower);
      if (byTitle) return byTitle;
    }
    return undefined;
  };

  // ВСПОМОГАТЕЛЬНО: проверка, что строка это только время без даты
  const isTimeOnly = (value?: string): boolean => {
    if (!value) return false;
    const hasDate = /^\d{4}-\d{2}-\d{2}/.test(value) || value.includes('T');
    if (hasDate) return false;
    // HH:mm[:ss][ AM/PM]
    return /^(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*(AM|PM))?$/i.test(value.trim());
  };

  // ВСПОМОГАТЕЛЬНО: за��енить время в RFC3339, сохраняя дату и смещение
  const replaceTimeInRFC3339 = (baseDateTime: string, timeStr: string, fallbackOffset?: string): string => {
    // Извлекаем дату и смещение из baseDateTime, если есть
    const m = baseDateTime.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:?\d{0,2}(?:\.\d+)?(Z|[+\-]\d{2}:\d{2})?$/);
    const datePart = baseDateTime.slice(0, 10); // YYYY-MM-DD
    // Парсим время
    const t = timeStr.trim();
    const timeMatch = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*(AM|PM))?$/i);
    if (!timeMatch) return baseDateTime; // не смогли распарсить
    let hh = parseInt(timeMatch[1], 10);
    const mm = parseInt(timeMatch[2] || '0', 10);
    const ss = parseInt(timeMatch[3] || '0', 10);
    const ampm = (timeMatch[5] || '').toUpperCase();
    if (ampm === 'AM' && hh === 12) hh = 0;
    if (ampm === 'PM' && hh < 12) hh += 12;

    const offsetPart = (m && m[2]) ? m[2] : (fallbackOffset || 'Z');
    const hhStr = String(hh).padStart(2, '0');
    const mmStr = String(mm).padStart(2, '0');
    const ssStr = String(ss).padStart(2, '0');
    return `${datePart}T${hhStr}:${mmStr}:${ssStr}${offsetPart || ''}`;
  };

  // Нормализуем new_start/new_end если пришло только время
  const normalizeChangeDateTimes = (change: ScheduleChange): ScheduleChange => {
    const event = findEventForChange(change);
    if (!event) return change;

    const baseStart = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00Z` : undefined);
    const baseEnd = event.end?.dateTime || (event.end?.date ? `${event.end.date}T23:59:59Z` : undefined);

    const getOffset = (dt?: string) => {
      if (!dt) return undefined;
      const m = dt.match(/(Z|[+\-]\d{2}:\d{2})$/);
      return m ? m[1] : undefined;
    };

    const startOffset = getOffset(baseStart);
    const endOffset = getOffset(baseEnd);

    const normalized: ScheduleChange = { ...change };
    if (change.new_start && isTimeOnly(change.new_start) && baseStart) {
      normalized.new_start = replaceTimeInRFC3339(baseStart, change.new_start, startOffset);
    }
    if (change.new_end && isTimeOnly(change.new_end) && baseEnd) {
      normalized.new_end = replaceTimeInRFC3339(baseEnd, change.new_end, endOffset);
    }
    return normalized;
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

  // Проверка: актуальное или повторяющееся событие
  const isEventActiveOrRecurring = (event: CalendarEvent): boolean => {
    if (!event || event.status === 'cancelled') return false;

    const now = new Date();

    // Повторяющиеся события (master) — учитываем окончание серии по RRULE:UNTIL
    if (event.recurrence && event.recurrence.length > 0) {
      try {
        const rule = RRuleParser.parseRRule(event.recurrence[0]);
        if (rule.until && rule.until < now) return false; // серия закончилась
        return true; // серия активна или без ограничения
      } catch {
        return true; // на всякий случай считаем активным
      }
    }

    // Экземпляры повторяющихся и одиночные — проверяем дату окончания
    const endISO = event.end?.dateTime || (event.end?.date ? `${event.end.date}T23:59:59` : undefined);
    if (!endISO) return false;

    const end = new Date(endISO);
    return end >= now;
  };

  // Получение анализа календаря (упрощенный асинхронный подход)
  const getCalendarAnalysis = async (forceRefresh: boolean = false): Promise<void> => {
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

      // Фильтруем только актуальные/повторяющиеся события для анализа
      const filteredEvents = eventsList.filter(isEventActiveOrRecurring);

      if (filteredEvents.length === 0) {
        console.warn('Нет актуальных событий для анализа, отправляем пустой список');
      }

      const requestData = {
        calendar_events: filteredEvents,
        user_goals: goalsList,
        analysis_period_days: 7
      };

      // Простой асинхронный анализ через FastAPI
      console.log('🚀 Starting AI analysis...');
      const analysisResult = await aiService.analyzeCalendar(requestData, forceRefresh);

      // Нормализуем предложенные изменения
      const normalizedChanges = (analysisResult.schedule_changes || []).map(ch => normalizeChangeDateTimes(ch));

      setAnalysis({ ...analysisResult, schedule_changes: normalizedChanges });

    } catch (error) {
      console.error('AI analysis error:', error);
      setError(error instanceof Error ? error.message : 'Ошибка при анализе календаря');
    } finally {
      setLoading(false);
    }
  };

  // Применение изменения в расписании
  const applyScheduleChange = async (change: ScheduleChange, index: number) => {
    setApplyingChange(index);

    const key = getChangeKey(change);

    try {
      const normalized = normalizeChangeDateTimes(change);
      const action = normalized.action?.toLowerCase();

      if ((action === 'update' || action === 'reschedule' || action === 'move' || action === 'optimize') && normalized.id) {
        const patchBody: any = {};
        if (normalized.new_start) patchBody.start = { dateTime: normalized.new_start };
        if (normalized.new_end) patchBody.end = { dateTime: normalized.new_end };
        await aiService.updateCalendarEvent(normalized.id, patchBody);
      } else if (action === 'cancel') {
        if (!normalized.id) {
          throw new Error('Нельзя отменить: отсутствует ID события');
        }
        await calendarService.deleteEvent(normalized.id);
      } else if (action === 'create') {
        if (!normalized.new_start || !normalized.new_end) {
          throw new Error('Для создания события нужны new_start и new_end');
        }
        const eventPayload = {
          summary: normalized.title || 'Новое событие',
            description: normalized.reason || 'Создано ИИ',
            start: { dateTime: normalized.new_start },
            end: { dateTime: normalized.new_end },
            reminders: { useDefault: true }
        };
        await calendarService.createEvent(eventPayload);
      }

      setAppliedChanges(prev => {
        const next = new Set(prev);
        next.add(key);
        persistHandledChanges(next, rejectedChanges);
        return next;
      });

      const freshEvents = await calendarService.forceRefreshEvents();
      setEvents(freshEvents);
      localStorage.setItem('calendar_events', JSON.stringify(freshEvents));

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

          {/* Показываем прогресс задачи если есть */}
          {taskStatus && (
            <TaskProgress
              taskStatus={taskStatus}
              taskType="Анализ календаря с ИИ"
            />
          )}
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
            <span className="stat-value">{events.filter(isEventActiveOrRecurring).length}</span>
            <span className="stat-label">Актуальные</span>
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
