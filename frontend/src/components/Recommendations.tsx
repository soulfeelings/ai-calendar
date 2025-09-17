import React, { useState, useEffect } from 'react';
import { aiService, CalendarAnalysis, SmartGoal, ScheduleChange } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import { RRuleParser } from '../utils/rruleParser';
import './Recommendations.css';

// Добавляем тип анализа
type AnalysisType = 'week' | 'tomorrow' | 'general';

interface AnalysisTypeOption {
  type: AnalysisType;
  title: string;
  description: string;
  icon: string;
  period_days: number;
}

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
  const [appliedChanges, setAppliedChanges] = useState<Set<string>>(new Set());
  const [rejectedChanges, setRejectedChanges] = useState<Set<string>>(new Set());
  const [applyingChange, setApplyingChange] = useState<number | null>(null);

  // Новое состояние для выбора типа анализа
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<AnalysisType | null>(null);
  const [showAnalysisSelection, setShowAnalysisSelection] = useState(true);

  // Ключи в localStorage для персистентности
  const APPLIED_KEY = 'ai_applied_schedule_change_ids';
  const REJECTED_KEY = 'ai_rejected_schedule_change_ids';

  // Опции типов анализа
  const analysisOptions: AnalysisTypeOption[] = [
    {
      type: 'week',
      title: 'Календарь на неделю',
      description: 'ИИ проанализирует ваш календарь на ближайшую неделю и предложит оптимизацию с учетом ваших целей',
      icon: '📅',
      period_days: 7
    },
    {
      type: 'tomorrow',
      title: 'Календарь на завтра',
      description: 'ИИ проанализирует ваши планы на завтра и предложит улучшения',
      icon: '🌅',
      period_days: 1
    },
    {
      type: 'general',
      title: 'Общий анализ',
      description: 'Комплексный анализ всего календаря с рекомендациями по тайм-менеджменту',
      icon: '🔍',
      period_days: 30
    }
  ];

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

  // ВСПОМОГАТЕЛЬНО: заменить время в RFC3339, сохраняя дату и смещение
  const replaceTimeInRFC3339 = (baseDateTime: string, timeStr: string, fallbackOffset?: string): string => {
    // Извлекаем дату и смещение из baseDateTime, если есть
    const m = baseDateTime.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:?\d{0,2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/);
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
      const m = dt.match(/(Z|[+-]\d{2}:\d{2})$/);
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
        const goalsData = await aiService.getGoals(true);

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

  // Фильтрация событий по периоду анализа
  const filterEventsByPeriod = (events: CalendarEvent[], analysisType: AnalysisType): CalendarEvent[] => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let endDate: Date;

    switch (analysisType) {
      case 'tomorrow':
        // Завтра: от начала завтрашнего дня до конца завтрашнего дня
        const tomorrow = new Date(startOfToday);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const endOfTomorrow = new Date(tomorrow);
        endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
        endDate = endOfTomorrow;
        break;

      case 'week':
        // Неделя: от сегодня до конца недели (7 дней)
        endDate = new Date(startOfToday);
        endDate.setDate(endDate.getDate() + 7);
        break;

      case 'general':
      default:
        // Общий анализ: все активные события
        return events.filter(isEventActiveOrRecurring);
    }

    return events.filter(event => {
      if (!isEventActiveOrRecurring(event)) return false;

      // Получаем дату начала события
      const eventStartStr = event.start?.dateTime || event.start?.date;
      if (!eventStartStr) return false;

      const eventStart = new Date(eventStartStr);

      // Для завтра: события только завтрашнего дня
      if (analysisType === 'tomorrow') {
        const tomorrow = new Date(startOfToday);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const endOfTomorrow = new Date(tomorrow);
        endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

        return eventStart >= tomorrow && eventStart < endOfTomorrow;
      }

      // Для недели: события от сегодня до конца недели
      return eventStart >= startOfToday && eventStart < endDate;
    });
  };

  // Модифицированная функция получения анализа календаря
  const getCalendarAnalysis = async (analysisType: AnalysisType, forceRefresh: boolean = false) => {
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

      // Фильтруем события по выбранному периоду
      const filteredEvents = filterEventsByPeriod(eventsList, analysisType);

      if (filteredEvents.length === 0 && analysisType !== 'general') {
        const periodName = analysisType === 'tomorrow' ? 'на завтра' : 'на ближайшую неделю';
        setError(`Нет событий ${periodName} для анализа`);
        return;
      }

      // Получаем соответствующий период для API
      const option = analysisOptions.find(opt => opt.type === analysisType);
      const periodDays = option?.period_days || 7;

      // Отправляем события на анализ ИИ
      const analysisResult = await aiService.analyzeCalendar({
        calendar_events: filteredEvents,
        user_goals: goalsList,
        analysis_period_days: periodDays,
        analysis_type: analysisType // Добавляем поле analysis_type
      }, forceRefresh);

      // Нормализуем предложенные изменения
      const normalizedChanges = (analysisResult.schedule_changes || []).map(ch => normalizeChangeDateTimes(ch));

      setAnalysis({ ...analysisResult, schedule_changes: normalizedChanges });
      setShowAnalysisSelection(false);

    } catch (err: any) {
      console.error('Error getting calendar analysis:', err);
      setError(err.message || 'Произошла ошибка при анализе календаря');
    } finally {
      setLoading(false);
    }
  };

  // Обработчик выбора типа анализа
  const handleAnalysisTypeSelect = (analysisType: AnalysisType) => {
    setSelectedAnalysisType(analysisType);
    getCalendarAnalysis(analysisType);
  };

  // Функция для возврата к выбору типа анализа
  const goBackToSelection = () => {
    setShowAnalysisSelection(true);
    setSelectedAnalysisType(null);
    setAnalysis(null);
    setError(null);
  };

  // Обновление анализа календаря
  const refreshCalendarAnalysis = async () => {
    if (selectedAnalysisType) {
      aiService.clearAICache();
      await getCalendarAnalysis(selectedAnalysisType, true);
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

  // Загружаем обработанные изменения при монтировании
  useEffect(() => {
    loadHandledChanges();
  }, []);

  // Показываем экран выбора типа анализа
  if (showAnalysisSelection && !loading) {
    return (
      <div className="recommendations-container">
        <div className="analysis-selection">
          <h2>Выберите тип анализа календаря</h2>
          <p className="selection-subtitle">
            ИИ проанализирует ваш календарь и цели, предложит оптимизацию расписания
          </p>

          <div className="analysis-options">
            {analysisOptions.map((option) => (
              <div
                key={option.type}
                className="analysis-option"
                onClick={() => handleAnalysisTypeSelect(option.type)}
              >
                <div className="option-icon">{option.icon}</div>
                <div className="option-content">
                  <h3>{option.title}</h3>
                  <p>{option.description}</p>
                </div>
                <div className="option-arrow">→</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    const selectedOption = analysisOptions.find(opt => opt.type === selectedAnalysisType);
    return (
      <div className="recommendations-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Анализируем ваш календарь...</p>
          {selectedOption && (
            <p className="analysis-type-hint">
              {selectedOption.icon} {selectedOption.title}
            </p>
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
          <div className="error-actions">
            <button onClick={() => selectedAnalysisType && getCalendarAnalysis(selectedAnalysisType)} className="retry-button">
              Попробовать снова
            </button>
            <button onClick={goBackToSelection} className="back-button">
              Выбрать другой тип анализа
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="recommendations-container">
        <div className="no-analysis">
          <p>Нет данных для отображения</p>
          <button onClick={goBackToSelection} className="back-button">
            Выбрать тип анализа
          </button>
        </div>
      </div>
    );
  }

  // Фильтруем изменения: скрываем те, что уже применены или отклонены
  const visibleChanges = (analysis.schedule_changes || []).filter(change => {
    const key = getChangeKey(change);
    return !appliedChanges.has(key) && !rejectedChanges.has(key);
  });

  const selectedOption = analysisOptions.find(opt => opt.type === selectedAnalysisType);

  return (
    <div className="recommendations-container">
      <div className="recommendations-header">
        <div className="header-top">
          <button onClick={goBackToSelection} className="back-to-selection">
            ← Выбрать другой анализ
          </button>
          <button onClick={refreshCalendarAnalysis} className="refresh-button">
            🔄 Обновить анализ
          </button>
        </div>

        {selectedOption && (
          <div className="current-analysis-type">
            <span className="analysis-icon">{selectedOption.icon}</span>
            <h2>{selectedOption.title}</h2>
          </div>
        )}
      </div>

      {/* Рекомендации */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="recommendations-section">
          <h3>💡 Рекомендации</h3>
          <div className="recommendations-list">
            {analysis.recommendations.map((recommendation, index) => (
              <RecommendationCard key={index} recommendation={recommendation} />
            ))}
          </div>
        </div>
      )}

      {/* Предложенные изменения */}
      {visibleChanges.length > 0 && (
        <div className="schedule-changes-section">
          <h3>🔄 Предложенные изменения в расписании</h3>
          <div className="schedule-changes-list">
            {visibleChanges.map((change, index) => (
              <ScheduleChangeCard
                key={getChangeKey(change)}
                change={change}
                onApply={() => applyScheduleChange(change, index)}
                onReject={() => rejectScheduleChange(change)}
                isApplying={applyingChange === index}
              />
            ))}
          </div>
        </div>
      )}

      {/* Если нет видимых изменений */}
      {(!analysis.recommendations || analysis.recommendations.length === 0) &&
       visibleChanges.length === 0 && (
        <div className="no-recommendations">
          <div className="no-recommendations-content">
            <span className="no-recommendations-icon">✅</span>
            <h3>Ваш календарь выглядит отлично!</h3>
            <p>
              {selectedAnalysisType === 'tomorrow' && 'На завтра у вас хорошо спланированный день.'}
              {selectedAnalysisType === 'week' && 'Ваше расписание на неделю хорошо оптимизировано.'}
              {selectedAnalysisType === 'general' && 'ИИ не нашел критических проблем в вашем календаре.'}
            </p>
            <p>Попробуйте обновить анализ позже или выберите другой период.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recommendations;
