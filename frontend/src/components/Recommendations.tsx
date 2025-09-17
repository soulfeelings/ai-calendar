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

interface NoGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToGoals: () => void;
}

const NoGoalsModal: React.FC<NoGoalsModalProps> = ({ isOpen, onClose, onGoToGoals }) => {
  console.log('🔔 NoGoalsModal render:', { isOpen });

  // Добавляем эффект для отслеживания изменений состояния модального окна
  useEffect(() => {
    console.log('🔔 NoGoalsModal isOpen changed:', isOpen);
  }, [isOpen]);

  if (!isOpen) {
    console.log('🔔 NoGoalsModal not rendering - isOpen is false');
    return null;
  }

  console.log('🔔 NoGoalsModal rendering modal content');

  return (
    <div className="no-goals-modal-overlay" onClick={onClose}>
      <div className="no-goals-modal" onClick={(e) => e.stopPropagation()}>
        <span className="no-goals-modal-icon">🎯</span>
        <h3>Нет целей для планирования</h3>
        <p>
          Для создания полного расписания необходимо добавить хотя бы одну цель.
          ИИ создаст оптимальный план на основе ваших целей и лучших практик тайм-менеджмента.
        </p>
        <div className="no-goals-modal-actions">
          <button className="primary-button" onClick={onGoToGoals}>
            ➕ Добавить цели
          </button>
          <button className="secondary-button" onClick={onClose}>
            Попробовать позже
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [showNoGoalsModal, setShowNoGoalsModal] = useState(false);

  // Ключи в localStorage для персистентности
  const APPLIED_KEY = 'ai_applied_schedule_change_ids';
  const REJECTED_KEY = 'ai_rejected_schedule_change_ids';

  // Опции типов анализа
  const analysisOptions: AnalysisTypeOption[] = [
    {
      type: 'week',
      title: 'Календарь на неделю',
      description: 'ИИ составит полное расписание на неделю на основе ваших целей и лучших практик тайм-менеджмента',
      icon: '📅',
      period_days: 7
    },
    {
      type: 'tomorrow',
      title: 'Календарь на завтра',
      description: 'ИИ составит оптимальное расписание на завтрашний день с учетом ваших целей',
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

  // Добавляем эффект для отслеживания изменений состояния showNoGoalsModal
  useEffect(() => {
    console.log('🔄 showNoGoalsModal state changed:', showNoGoalsModal);
  }, [showNoGoalsModal]);

  // Добавляем эффект для отслеживания изменений состояния loading
  useEffect(() => {
    console.log('⏳ loading state changed:', loading);
  }, [loading]);

  // Тестовая функция для принудительного показа модального окна
  const testModal = () => {
    console.log('🧪 Testing modal - setting showNoGoalsModal to true');
    setShowNoGoalsModal(true);
  };

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

    console.log('🔍 Filter debug info:', {
      now: now.toISOString(),
      startOfToday: startOfToday.toISOString(),
      analysisType,
      totalEvents: events.length
    });

    switch (analysisType) {
      case 'tomorrow':
        // Завтра: от начала завтрашнего дня до конца завтрашнего дня
        const tomorrow = new Date(startOfToday);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = new Date(tomorrow);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        console.log('📅 Tomorrow filter range:', {
          tomorrowStart: tomorrowStart.toISOString(),
          tomorrowEnd: tomorrowEnd.toISOString()
        });

        const tomorrowEvents = events.filter(event => {
          if (!isEventActiveOrRecurring(event)) {
            return false;
          }

          const eventStartStr = event.start?.dateTime || event.start?.date;
          const eventEndStr = event.end?.dateTime || event.end?.date;
          if (!eventStartStr) return false;

          const eventStart = new Date(eventStartStr);
          const eventEnd = new Date(eventEndStr || eventStartStr);

          // Проверяем пересечение события с завтрашним днем
          // Событие попадает в день, если:
          // 1. Начинается в этот день
          // 2. Заканчивается в этот день
          // 3. Начинается до этого дня и заканчивается после (долгое событие)
          const isInRange = (eventStart >= tomorrowStart && eventStart <= tomorrowEnd) ||
                           (eventEnd >= tomorrowStart && eventEnd <= tomorrowEnd) ||
                           (eventStart <= tomorrowStart && eventEnd >= tomorrowEnd);

          console.log('📅 Event check:', {
            eventId: event.id,
            eventSummary: event.summary,
            eventStartStr,
            eventEndStr,
            eventStart: eventStart.toISOString(),
            eventEnd: eventEnd.toISOString(),
            tomorrowStart: tomorrowStart.toISOString(),
            tomorrowEnd: tomorrowEnd.toISOString(),
            isInRange,
            isActive: isEventActiveOrRecurring(event)
          });

          return isInRange;
        });

        console.log('✅ Tomorrow filtering completed:', {
          originalCount: events.length,
          filteredCount: tomorrowEvents.length
        });

        return tomorrowEvents;

      case 'week':
        // Неделя: от сегодня до +7 дней
        const weekEnd = new Date(startOfToday);
        weekEnd.setDate(weekEnd.getDate() + 7);
        weekEnd.setHours(23, 59, 59, 999);

        return events.filter(event => {
          if (!isEventActiveOrRecurring(event)) return false;

          const eventStartStr = event.start?.dateTime || event.start?.date;
          const eventEndStr = event.end?.dateTime || event.end?.date;
          if (!eventStartStr) return false;

          const eventStart = new Date(eventStartStr);
          const eventEnd = new Date(eventEndStr || eventStartStr);

          // Событие попадает в неделю, если пересекается с периодом от сегодня до +7 дней
          return (eventStart >= startOfToday && eventStart <= weekEnd) ||
                 (eventEnd >= startOfToday && eventEnd <= weekEnd) ||
                 (eventStart <= startOfToday && eventEnd >= weekEnd);
        });

      case 'general':
      default:
        // Общий анализ: все активные события
        return events.filter(isEventActiveOrRecurring);
    }
  };

  // Модифицированная функция получения анализа календаря
  const getCalendarAnalysis = async (analysisType: AnalysisType, forceRefresh: boolean = false) => {
    console.log('🚀 Starting getCalendarAnalysis:', { analysisType, forceRefresh });

    setLoading(true);
    setError(null);
    setShowNoGoalsModal(false); // Сбрасываем состояние модального окна

    try {
      console.log('📊 Loading events and goals...');
      // Загружаем события и цели
      const [eventsList, goalsList] = await Promise.all([
        loadEvents(),
        loadGoals()
      ]);

      console.log('📋 Loaded data:', {
        eventsCount: eventsList?.length || 0,
        goalsCount: goalsList?.length || 0,
        goals: goalsList
      });

      // Для создания полного расписания (tomorrow или week) проверяем наличие целей
      if (analysisType === 'tomorrow' || analysisType === 'week') {
        console.log('🎯 Checking goals for full schedule:', {
          goalsListLength: goalsList?.length,
          goalsListIsArray: Array.isArray(goalsList),
          goalsList,
          analysisType
        });

        // Более надежная проверка целей
        const hasGoals = goalsList && Array.isArray(goalsList) && goalsList.length > 0;

        if (!hasGoals) {
          console.log('❌ No goals found, showing modal. Goals check details:', {
            goalsList,
            isArray: Array.isArray(goalsList),
            length: goalsList?.length,
            hasGoals
          });

          setLoading(false); // Останавливаем загрузку
          setShowNoGoalsModal(true); // Показываем модальное окно

          console.log('✅ Modal state set to true, current showNoGoalsModal:', true);
          return;
        }

        console.log('✅ Goals found, creating full schedule');
        await createFullSchedule(analysisType, eventsList || [], goalsList);
        return;
      }

      // Для обычного анализа (general) используем стандартную логику
      if (!eventsList || eventsList.length === 0) {
        setError('Нет событий для анализа');
        return;
      }

      // Фильтруем события по выбранному периоду
      const filteredEvents = filterEventsByPeriod(eventsList, analysisType);
      console.log('🔍 Filtered events:', {
        originalCount: eventsList.length,
        filteredCount: filteredEvents.length,
        analysisType
      });

      // Для общего анализа требуем наличие событий
      if (filteredEvents.length === 0) {
        setError('Нет событий для анализа в выбранном периоде');
        return;
      }

      // Получаем соответствующий период для API
      const option = analysisOptions.find(opt => opt.type === analysisType);
      const periodDays = option?.period_days || 30;

      console.log('🎯 Preparing AI request:', {
        filteredEventsCount: filteredEvents.length,
        goalsCount: goalsList.length,
        periodDays,
        analysisType
      });

      // Отправляем события на анализ ИИ
      const analysisResult = await aiService.analyzeCalendar({
        calendar_events: filteredEvents,
        user_goals: goalsList,
        analysis_period_days: periodDays,
        analysis_type: analysisType
      }, forceRefresh);

      console.log('✅ Analysis completed:', analysisResult);

      // Нормализуем предложенные изменения
      const normalizedChanges = (analysisResult.schedule_changes || []).map(ch => normalizeChangeDateTimes(ch));

      setAnalysis({ ...analysisResult, schedule_changes: normalizedChanges });
      setShowAnalysisSelection(false);

    } catch (err: any) {
      console.error('❌ Error getting calendar analysis:', err);
      setError(err.message || 'Произошла ошибка при анализе календаря');
    } finally {
      setLoading(false);
    }
  };

  // Новая функция для создания полного расписания
  const createFullSchedule = async (scheduleType: 'tomorrow' | 'week', eventsList: CalendarEvent[], goalsList: SmartGoal[]) => {
    try {
      console.log('📅 Creating full schedule:', { scheduleType, goalsCount: goalsList.length, eventsCount: eventsList.length });

      // Фильтруем существующие события для периода
      const filteredEvents = filterEventsByPeriod(eventsList, scheduleType);
      console.log('🔍 Filtered events for full schedule:', { originalCount: eventsList.length, filteredCount: filteredEvents.length });

      const scheduleRequest = {
        schedule_type: scheduleType,
        user_goals: goalsList,
        existing_events: filteredEvents,
        work_hours_start: "09:00",
        work_hours_end: "18:00",
        break_duration_minutes: 60,
        buffer_between_events_minutes: 15
      };

      console.log('📤 Sending full schedule request:', scheduleRequest);

      const fullScheduleResult = await aiService.createFullSchedule(scheduleRequest);

      console.log('✅ Full schedule created:', fullScheduleResult);

      // Преобразуем полное расписание в формат анализа для отображения
      const scheduleChanges: ScheduleChange[] = [];
      const recommendations: string[] = [...fullScheduleResult.recommendations];

      // Добавляем краткую сводку по дням
      fullScheduleResult.schedules.forEach((daySchedule, dayIndex) => {
        recommendations.push(`📅 ${daySchedule.day_name} (${daySchedule.date}): ${daySchedule.events.length} событий, ${daySchedule.total_productive_hours || 0}ч продуктивного времени`);

        // Создаем изменения для каждого события в расписании
        daySchedule.events.forEach((event, eventIndex) => {
          scheduleChanges.push({
            id: `schedule_${dayIndex}_${eventIndex}`,
            action: 'create',
            title: event.title,
            reason: event.description || `Запланировано в рамках цели. Категория: ${event.category || 'general'}`,
            new_start: event.start_time,
            new_end: event.end_time,
            priority: event.priority || 'medium'
          });
        });
      });

      // Добавляем общие рекомендации
      if (fullScheduleResult.reasoning) {
        recommendations.push(`🤖 ИИ: ${fullScheduleResult.reasoning}`);
      }

      const analysisResult: CalendarAnalysis = {
        summary: `Создано полное расписание на ${scheduleType === 'tomorrow' ? 'завтра' : 'неделю'}. Учтено целей: ${fullScheduleResult.total_goals_addressed}. Оценка продуктивности: ${fullScheduleResult.productivity_score || 0}/10`,
        schedule_changes: scheduleChanges,
        recommendations: recommendations,
        productivity_score: fullScheduleResult.productivity_score,
        goal_alignment: `Учтено ${fullScheduleResult.total_goals_addressed} из ${goalsList.length} целей`
      };

      console.log('🎯 Setting analysis result:', analysisResult);
      setAnalysis(analysisResult);
      setShowAnalysisSelection(false);

    } catch (error: any) {
      console.error('❌ Error creating full schedule:', error);
      throw error;
    }
  };

  // Обработчик выбора типа анализа
  const handleAnalysisTypeSelect = (analysisType: AnalysisType) => {
    console.log('🎯 handleAnalysisTypeSelect called with:', analysisType);
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

          {/* Тестовая кнопка для проверки модального окна */}
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <button
              onClick={testModal}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ff6b6b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🧪 Тест модального окна
            </button>
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
              showNoGoalsModal: {showNoGoalsModal ? 'true' : 'false'}
            </p>
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

  // Логирование для отладки модального окна
  console.log('🔧 Rendering NoGoalsModal with props:', {
    showNoGoalsModal,
    isOpen: showNoGoalsModal
  });

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

      {/* Сводка анализа */}
      {analysis.summary && (
        <div className="analysis-summary">
          <h3>📊 Сводка анализа</h3>
          <p>{analysis.summary}</p>

          {analysis.productivity_score !== undefined && (
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
      )}

      {/* Модальное окно "Нет целей" */}
      <NoGoalsModal
        isOpen={showNoGoalsModal}
        onClose={() => {
          console.log('🔔 Closing NoGoalsModal');
          setShowNoGoalsModal(false);
        }}
        onGoToGoals={() => {
          console.log('🎯 Navigating to goals');
          setShowNoGoalsModal(false);
          // Переходим к странице целей (предполагается роутинг через React Router)
          window.location.href = '/goals';
        }}
      />
    </div>
  );
};

export default Recommendations;
