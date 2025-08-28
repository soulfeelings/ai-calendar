import React, { useState, useEffect } from 'react';
import { aiService, CalendarAnalysis, SmartGoal, ScheduleChange } from '../services/aiService';
import { calendarService, CalendarEvent } from '../services/calendarService';
import './Recommendations.css';

interface RecommendationCardProps {
  recommendation: string;
  index: number;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation, index }) => (
  <div className="recommendation-card">
    <div className="recommendation-number">{index + 1}</div>
    <div className="recommendation-text">{recommendation}</div>
  </div>
);

interface ScheduleChangeCardProps {
  change: ScheduleChange;
  onAccept: () => void;
  onReject: () => void;
  isLoading: boolean;
}

const ScheduleChangeCard: React.FC<ScheduleChangeCardProps> = ({ 
  change, 
  onAccept, 
  onReject, 
  isLoading 
}) => {
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create': return '➕';
      case 'update': return '✏️';
      case 'delete': return '🗑️';
      default: return '📅';
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'create': return 'Создать событие';
      case 'update': return 'Обновить событие';
      case 'delete': return 'Удалить событие';
      default: return 'Изменить событие';
    }
  };

  const formatDateTime = (dateTime?: string) => {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="schedule-change-card">
      <div className="change-header">
        <span className="change-icon">{getActionIcon(change.action)}</span>
        <span className="change-action">{getActionText(change.action)}</span>
      </div>
      
      {change.title && (
        <div className="change-detail">
          <strong>Название:</strong> {change.title}
        </div>
      )}
      
      {change.start_time && (
        <div className="change-detail">
          <strong>Начало:</strong> {formatDateTime(change.start_time)}
        </div>
      )}
      
      {change.end_time && (
        <div className="change-detail">
          <strong>Конец:</strong> {formatDateTime(change.end_time)}
        </div>
      )}
      
      {change.location && (
        <div className="change-detail">
          <strong>Место:</strong> {change.location}
        </div>
      )}
      
      <div className="change-reason">
        <strong>Причина:</strong> {change.reason}
      </div>
      
      <div className="change-actions">
        <button 
          className="btn-accept" 
          onClick={onAccept}
          disabled={isLoading}
        >
          {isLoading ? 'Применяется...' : 'Согласиться'}
        </button>
        <button 
          className="btn-reject" 
          onClick={onReject}
          disabled={isLoading}
        >
          Отклонить
        </button>
      </div>
    </div>
  );
};

const Recommendations: React.FC = () => {
  const [analysis, setAnalysis] = useState<CalendarAnalysis | null>(null);
  const [goals, setGoals] = useState<SmartGoal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedChanges, setAppliedChanges] = useState<Set<number>>(new Set());
  const [rejectedChanges, setRejectedChanges] = useState<Set<number>>(new Set());

  // Загрузка данных при монтировании компонента
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Загружаем события календаря и цели параллельно
      const [eventsResponse, goalsData] = await Promise.all([
        calendarService.getEvents(),
        aiService.getGoals()
      ]);

      setEvents(eventsResponse.events || []);
      setGoals(goalsData);
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError('Ошибка при загрузке данных. Попробуйте обновить страницу.');
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeCalendar = async () => {
    if (events.length === 0) {
      setError('Нет событий календаря для анализа');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const analysisResult = await aiService.analyzeCalendar({
        calendar_events: events,
        user_goals: goals,
        analysis_period_days: 7
      });

      setAnalysis(analysisResult);
      setAppliedChanges(new Set());
      setRejectedChanges(new Set());
    } catch (err: any) {
      console.error('Error analyzing calendar:', err);
      setError(err.response?.data?.detail || 'Ошибка при анализе календаря');
    } finally {
      setIsLoading(false);
    }
  };

  const applyScheduleChange = async (change: ScheduleChange, index: number) => {
    try {
      // Здесь будет логика применения изменений
      if (change.action === 'create') {
        // Создание нового события - пока что просто помечаем как применено
        console.log('Creating event:', change);
      } else if (change.action === 'update' && change.event_id) {
        // Обновление существующего события
        await aiService.updateCalendarEvent(change.event_id, {
          summary: change.title,
          description: change.description,
          location: change.location,
          start: change.start_time ? { dateTime: change.start_time } : undefined,
          end: change.end_time ? { dateTime: change.end_time } : undefined
        });
      }

      setAppliedChanges(prev => new Set([...prev, index]));
    } catch (err: any) {
      console.error('Error applying schedule change:', err);
      setError(err.response?.data?.detail || 'Ошибка при применении изменения');
    }
  };

  const rejectScheduleChange = (index: number) => {
    setRejectedChanges(prev => new Set([...prev, index]));
  };

  const getProductivityScoreColor = (score: number) => {
    if (score >= 8) return '#4caf50';
    if (score >= 6) return '#ff9800';
    return '#f44336';
  };

  if (isLoading && !analysis) {
    return (
      <div className="recommendations-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Загрузка данных...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recommendations-container">
      <header className="recommendations-header">
        <h1>🤖 AI Рекомендации</h1>
        <p>Анализ вашего календаря и целей для оптимизации времени</p>
      </header>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      <div className="stats-section">
        <div className="stat-card">
          <div className="stat-number">{events.length}</div>
          <div className="stat-label">События в календаре</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{goals.length}</div>
          <div className="stat-label">Активные цели</div>
        </div>
        {analysis && (
          <div className="stat-card">
            <div 
              className="stat-number"
              style={{ color: getProductivityScoreColor(analysis.productivity_score) }}
            >
              {analysis.productivity_score}/10
            </div>
            <div className="stat-label">Продуктивность</div>
          </div>
        )}
      </div>

      {!analysis ? (
        <div className="analyze-section">
          <button 
            className="btn-analyze"
            onClick={analyzeCalendar}
            disabled={isLoading || events.length === 0}
          >
            {isLoading ? 'Анализируем...' : '🔍 Анализировать календарь'}
          </button>
          {events.length === 0 && (
            <p className="help-text">
              Сначала добавьте события в календарь или убедитесь, что календарь синхронизирован
            </p>
          )}
        </div>
      ) : (
        <div className="analysis-results">
          <div className="analysis-overview">
            <h2>📊 Анализ календаря</h2>
            <div className="analysis-text">{analysis.analysis}</div>
            <div className="goal-alignment">
              <strong>Соответствие целям:</strong> 
              <span className={`alignment-${analysis.goal_alignment.toLowerCase()}`}>
                {analysis.goal_alignment}
              </span>
            </div>
          </div>

          {analysis.recommendations.length > 0 && (
            <div className="recommendations-section">
              <h3>💡 Рекомендации</h3>
              <div className="recommendations-list">
                {analysis.recommendations.map((recommendation, index) => (
                  <RecommendationCard 
                    key={index}
                    recommendation={recommendation}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}

          {analysis.schedule_changes.length > 0 && (
            <div className="schedule-changes-section">
              <h3>📅 Предлагаемые изменения</h3>
              <div className="schedule-changes-list">
                {analysis.schedule_changes.map((change, index) => {
                  if (appliedChanges.has(index) || rejectedChanges.has(index)) {
                    return null;
                  }
                  
                  return (
                    <ScheduleChangeCard
                      key={index}
                      change={change}
                      onAccept={() => applyScheduleChange(change, index)}
                      onReject={() => rejectScheduleChange(index)}
                      isLoading={isLoading}
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

          <div className="reanalyze-section">
            <button 
              className="btn-reanalyze"
              onClick={analyzeCalendar}
              disabled={isLoading}
            >
              {isLoading ? 'Анализируем...' : '🔄 Повторить анализ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recommendations;
