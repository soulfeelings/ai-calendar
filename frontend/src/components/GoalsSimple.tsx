import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiService, SmartGoal } from '../services/aiService';
import api from '../services/api';
import './Goals.css';

const priorityOptions = [
  { value: 'high', label: 'Высокий' },
  { value: 'medium', label: 'Средний' },
  { value: 'low', label: 'Низкий' },
];

const GoalsSimple: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState<SmartGoal>({
    title: '',
    description: '',
    deadline: '',
    priority: 'medium',
  });

  const [goals, setGoals] = useState<SmartGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Состояния для создания событий в календаре
  const [creatingEvents, setCreatingEvents] = useState<{[goalId: string]: boolean}>({});
  const [createdEvents, setCreatedEvents] = useState<{[goalId: string]: string}>({});

  // Загружаем информацию о созданных событиях из localStorage
  useEffect(() => {
    const savedEvents = localStorage.getItem('goalCalendarEvents');
    if (savedEvents) {
      try {
        setCreatedEvents(JSON.parse(savedEvents));
      } catch (e) {
        console.error('Error parsing saved events:', e);
      }
    }
  }, []);

  // Сохраняем информацию о созданных событиях в localStorage
  const saveCreatedEvent = (goalId: string, eventId: string) => {
    const updatedEvents = { ...createdEvents, [goalId]: eventId };
    setCreatedEvents(updatedEvents);
    localStorage.setItem('goalCalendarEvents', JSON.stringify(updatedEvents));
  };

  // Удаляем информацию о созданном событии
  const removeCreatedEvent = (goalId: string) => {
    const updatedEvents = { ...createdEvents };
    delete updatedEvents[goalId];
    setCreatedEvents(updatedEvents);
    localStorage.setItem('goalCalendarEvents', JSON.stringify(updatedEvents));
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    setLoading(true);
    setError(null);

    try {
      const goalsData = await aiService.getGoals();
      setGoals(goalsData);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить цели');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (key: keyof SmartGoal, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveGoal = async () => {
    if (!form.title.trim()) {
      setError('Название цели обязательно');
      return;
    }

    if (!form.description.trim()) {
      setError('Описание цели обязательно');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Создаем цель через API (с автоматическим SMART анализом)
      const response = await api.post('/ai/goals', {
        title: form.title,
        description: form.description,
        deadline: form.deadline || undefined,
        priority: form.priority,
      });

      setSuccess(`Цель "${form.title}" создана успешно! ИИ провел SMART анализ.`);

      // Очищаем форму
      setForm({
        title: '',
        description: '',
        deadline: '',
        priority: 'medium',
      });

      // Перезагружаем список целей
      await loadGoals();

    } catch (e: any) {
      console.error('Error saving goal:', e);
      setError(e?.response?.data?.detail || e?.message || 'Не удалось сохранить цель');
    } finally {
      setSaving(false);
      // Очищаем сообщения через 5 секунд
      setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту цель?')) {
      return;
    }

    try {
      await api.delete(`/ai/goals/${goalId}`);
      setSuccess('Цель удалена успешно');

      // Удаляем связанное событие из localStorage
      if (createdEvents[goalId]) {
        removeCreatedEvent(goalId);
      }

      await loadGoals();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Не удалось удалить цель');
    }
  };

  const createEventForGoal = async (goal: SmartGoal) => {
    if (!goal.id) return;

    setCreatingEvents(prev => ({ ...prev, [goal.id!]: true }));
    setError(null);

    try {
      // Определяем время события на основе дедлайна или завтра
      let startTime, endTime;

      if (goal.deadline) {
        const deadline = new Date(goal.deadline);
        startTime = deadline.toISOString();
        endTime = new Date(deadline.getTime() + 60 * 60 * 1000).toISOString(); // +1 час
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0); // 9 утра завтра
        startTime = tomorrow.toISOString();
        endTime = new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(); // +1 час
      }

      // Создаем событие на основе данных цели
      const eventData = {
        summary: `Работа над целью: ${goal.title}`,
        description: `🎯 Цель: ${goal.description}

${goal.smart_analysis ? `
📊 SMART Анализ (ИИ):
• Общий балл: ${goal.smart_analysis.overall_score || 'N/A'}/100
• Соответствует SMART: ${goal.smart_analysis.is_smart ? 'Да' : 'Нет'}

💡 Рекомендации ИИ:
${goal.smart_analysis.suggestions?.map((s: string) => `• ${s}`).join('\n') || 'Нет рекомендаций'}
` : ''}

🔔 Приоритет: ${priorityOptions.find(p => p.value === goal.priority)?.label || 'Средний'}`,
        start: {
          dateTime: startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        location: "Работа над целью",
        reminders: {
          useDefault: true
        }
      };

      const response = await api.post('/calendar/events', eventData);
      setSuccess(`Событие "${goal.title}" создано в календаре`);
      saveCreatedEvent(goal.id, response.data.id);

    } catch (e: any) {
      console.error('Error creating calendar event:', e);
      setError(e?.response?.data?.detail || e?.message || 'Не удалось создать событие в календаре');
    } finally {
      setCreatingEvents(prev => ({ ...prev, [goal.id!]: false }));
      setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
    }
  };

  const deleteEventForGoal = async (goal: SmartGoal) => {
    if (!goal.id || !createdEvents[goal.id]) return;

    const eventId = createdEvents[goal.id];
    setCreatingEvents(prev => ({ ...prev, [goal.id!]: true }));
    setError(null);

    try {
      await api.delete(`/calendar/events/${eventId}`);
      removeCreatedEvent(goal.id);
      setSuccess(`Событие "${goal.title}" удалено из календаря`);
    } catch (e: any) {
      console.error('Error deleting calendar event:', e);
      setError(e?.response?.data?.detail || e?.message || 'Не удалось удалить событие');
    } finally {
      setCreatingEvents(prev => ({ ...prev, [goal.id!]: false }));
      setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
    }
  };

  const canSave = form.title.trim().length > 0 && form.description.trim().length > 0;

  return (
    <div className="goals-container">
      <div className="goals-header">
        <h1>Мои цели</h1>
        <button onClick={() => navigate('/recommendations')} className="nav-button">
          К рекомендациям
        </button>
      </div>

      {/* Сообщения об ошибках и успехе */}
      {error && (
        <div className="message error-message">
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="message success-message">
          ✅ {success}
        </div>
      )}

      {/* Форма создания новой цели */}
      <div className="goal-form">
        <h2>Добавить новую цель</h2>

        <div className="form-group">
          <label htmlFor="title">Название цели *</label>
          <input
            id="title"
            type="text"
            value={form.title}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            placeholder="Например: Изучить TypeScript"
            maxLength={200}
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Описание цели *</label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="Подробное описание того, что вы хотите достичь..."
            rows={4}
            maxLength={1000}
          />
        </div>

        <div className="form-group">
          <label htmlFor="deadline">Дата окончания</label>
          <input
            id="deadline"
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => handleFieldChange('deadline', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="priority">Приоритет</label>
          <select
            id="priority"
            value={form.priority}
            onChange={(e) => handleFieldChange('priority', e.target.value)}
          >
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSaveGoal}
          disabled={!canSave || saving}
          className="save-button"
        >
          {saving ? 'Сохранение...' : 'Создать цель (с ИИ анализом)'}
        </button>

        <p className="form-note">
          * После создания цели ИИ автоматически проведет SMART анализ и даст рекомендации по улучшению
        </p>
      </div>

      {/* Список существующих целей */}
      <div className="goals-list">
        <h2>Мои цели ({goals.length})</h2>

        {loading && <div className="loading">Загрузка целей...</div>}

        {!loading && goals.length === 0 && (
          <div className="empty-state">
            <p>У вас пока нет целей. Создайте первую цель выше!</p>
          </div>
        )}

        {goals.map((goal) => (
          <div key={goal.id} className="goal-card">
            <div className="goal-header">
              <h3>{goal.title}</h3>
              <div className="goal-priority">
                <span className={`priority-badge priority-${goal.priority}`}>
                  {priorityOptions.find(p => p.value === goal.priority)?.label || 'Средний'}
                </span>
              </div>
            </div>

            <div className="goal-content">
              <p><strong>Описание:</strong> {goal.description}</p>

              {goal.deadline && (
                <p><strong>Дедлайн:</strong> {new Date(goal.deadline).toLocaleString('ru-RU')}</p>
              )}

              {/* Показываем результат SMART анализа от ИИ */}
              {goal.smart_analysis && (
                <div className="smart-analysis">
                  <h4>🤖 SMART Анализ от ИИ:</h4>
                  <div className="analysis-score">
                    <span>Общий балл: <strong>{goal.smart_analysis.overall_score || 'N/A'}/100</strong></span>
                    <span className={goal.smart_analysis.is_smart ? 'smart-yes' : 'smart-no'}>
                      {goal.smart_analysis.is_smart ? '✅ SMART' : '❌ Не SMART'}
                    </span>
                  </div>

                  {goal.smart_analysis.suggestions && goal.smart_analysis.suggestions.length > 0 && (
                    <div className="suggestions">
                      <strong>Рекомендации:</strong>
                      <ul>
                        {goal.smart_analysis.suggestions.map((suggestion: string, index: number) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="goal-actions">
              {/* Кнопка создания/удаления события в календаре */}
              {goal.id && createdEvents[goal.id] ? (
                <button
                  onClick={() => deleteEventForGoal(goal)}
                  disabled={creatingEvents[goal.id!]}
                  className="calendar-button delete"
                >
                  {creatingEvents[goal.id!] ? 'Удаление...' : '📅 Удалить из календаря'}
                </button>
              ) : (
                <button
                  onClick={() => createEventForGoal(goal)}
                  disabled={creatingEvents[goal.id!]}
                  className="calendar-button create"
                >
                  {creatingEvents[goal.id!] ? 'Добавление...' : '📅 Добавить в календарь'}
                </button>
              )}

              <button
                onClick={() => deleteGoal(goal.id!)}
                className="delete-button"
              >
                🗑️ Удалить цель
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GoalsSimple;
