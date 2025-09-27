import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiService, SmartGoal, GoalAnalysis } from '../services/aiService';
import api from '../services/api';
import './Goals.css';

const priorityOptions = [
  { value: 'high', label: 'Высокий' },
  { value: 'medium', label: 'Средний' },
  { value: 'low', label: 'Низкий' },
];

const Goals: React.FC = () => {
  const navigate = useNavigate();

  // Состояние этапов: 'input' | 'analysis' | 'saved'
  const [currentStep, setCurrentStep] = useState<'input' | 'analysis' | 'saved'>('input');

  const [form, setForm] = useState<SmartGoal>({
    title: '',
    description: '',
    deadline: '',
    priority: 'medium',
  });

  const [deadlineDate, setDeadlineDate] = useState<string>('');
  const [deadlineTime, setDeadlineTime] = useState<string>('');

  // Состояние для анализа ИИ
  const [goalAnalysis, setGoalAnalysis] = useState<GoalAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Список существующих целей
  const [goals, setGoals] = useState<SmartGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [creatingEvents, setCreatingEvents] = useState<{[goalId: string]: boolean}>({});
  const [createdEvents, setCreatedEvents] = useState<{[goalId: string]: string}>({});

  // Новые состояния для редактирования и удаления
  const [editingGoal, setEditingGoal] = useState<SmartGoal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Проверяем, заполнены ли основные поля для получения анализа
  const canAnalyze = form.title.trim().length > 0 && form.description.trim().length > 0;

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

  // Функция для удаления события из календаря
  const deleteEventForGoal = async (goal: SmartGoal) => {
    if (!goal.id || !createdEvents[goal.id]) return;

    const eventId = createdEvents[goal.id];
    setCreatingEvents(prev => ({ ...prev, [goal.id!]: true }));
    setError(null);

    try {
      // Удаляем событие из календаря
      await api.delete(`/calendar/events/${eventId}`);

      // Удаляем из локального хранилища
      removeCreatedEvent(goal.id);
      setSuccess(`Событие "${goal.title}" удалено из календаря`);

    } catch (e: any) {
      // Молча, список не критичен для создания
    } finally {
      setLoadingGoals(false);
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
        location: "Работа над SMART целью",
        reminders: {
          useDefault: true
        }
      };

      // Исполь��уем прямой API вызов к backend эндпоинту
      const response = await api.post('/calendar/events', eventData);

      setSuccess(`Событие "${goal.title}" создано в календаре`);
      // Сохраняем созданное событие в localStorage
      saveCreatedEvent(goal.id, response.data.id);

    } catch (e: any) {
      console.error('Error creating calendar event:', e);
      setError(e?.response?.data?.detail || e?.message || 'Не удалось создать событие в календаре');
    } finally {
      setCreatingEvents(prev => ({ ...prev, [goal.id!]: false }));
      // Очищаем сообщение через 5 секунд
      setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
    }
  };

  const [showAllGoals, setShowAllGoals] = useState(false);

  useEffect(() => {
    loadGoals(showAllGoals);
  }, [showAllGoals]);

  const loadGoals = async (all: boolean = false) => {
    setLoadingGoals(true);
    setError(null);

    try {
      // all === true -> показываем все (only_actual = false)
      const goalsData = await aiService.getGoals(true, !all);
      setGoals(goalsData);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить цели');
    } finally {
      setLoadingGoals(false);
    }
  };

  const handleFieldChange = (key: keyof SmartGoal, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAnalyzeGoal = async () => {
    if (!canAnalyze) return;

    setError(null);
    setAnalyzing(true);

    try {
      // Собираем deadline в ISO ��ормат, если дата указана
      let deadlineISO = '';
      if (deadlineDate) {
        deadlineISO = new Date(`${deadlineDate}T${deadlineTime || '23:59'}:00`).toISOString();
      }

      // Создаем объект для анализа с правильно сформированным deadline
      const goalForAnalysis = {
        ...form,
        deadline: deadlineISO
      };

      const analysis = await aiService.analyzeGoal(goalForAnalysis);
      setGoalAnalysis(analysis);
      setCurrentStep('analysis');
    } catch (e: any) {
      setError(e?.message || 'Не удалось проанализировать цель');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyImprovedGoal = () => {
    if (goalAnalysis?.improved_goal) {
      setForm(prev => ({
        ...prev,
        title: goalAnalysis.improved_goal!.title,
        description: goalAnalysis.improved_goal!.description,
      }));
      // Возвращаемся к форме для редактирования
      setCurrentStep('input');
      setGoalAnalysis(null);
    }
  };

  const editGoal = () => {
    // Возвраща��мся к форме редактирования с текущими данными
    setCurrentStep('input');
    setGoalAnalysis(null);
  };

  const handleSaveGoal = async () => {
    console.log('handleSaveGoal called'); // Добавляем логирование
    setError(null);
    setSuccess(null);

    // Собираем deadline в ISO, если дата указана
    let deadlineISO: string | undefined = undefined;
    if (deadlineDate) {
      deadlineISO = new Date(`${deadlineDate}T${deadlineTime || '23:59'}:00`).toISOString();
    }

    const payload: any = {
      title: form.title,
      description: form.description,
      priority: form.priority,
    };

    // Добавляем deadline только если он указан
    if (deadlineISO) {
      payload.deadline = deadlineISO;
    }

    console.log('Payload to send:', payload); // Логируем данные

    try {
      setSaving(true);

      // Проверяем, редактируем ли мы существующую цель или создаем новую
      if (editingGoal && editingGoal.id) {
        // Обновляем существующую цель
        console.log('Updating existing goal with ID:', editingGoal.id);
        await aiService.updateGoal(editingGoal.id, payload);
        setSuccess('Цель успешно обновлена');
      } else {
        // Создаем новую цель
        console.log('Creating new goal');
        await api.post('/ai/goals', payload);
        setSuccess('Цель создана');
      }

      setCurrentStep('saved');
      // Обновляем список
      await loadGoals();
      // Сбрасывае�� состояние редактирования
      setEditingGoal(null);
    } catch (e: any) {
      console.error('Error saving goal:', e);
      const errorMessage = e?.response?.data?.detail;
      if (Array.isArray(errorMessage)) {
        const validationErrors = errorMessage.map((err: any) => `${err.loc?.join('.')} - ${err.msg}`).join('; ');
        setError(`Ошибки валидац��и: ${validationErrors}`);
      } else {
        setError(errorMessage || e?.message || 'Не удалось сохранить цель');
      }
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      deadline: '',
      priority: 'medium',
    });
    setDeadlineDate('');
    setDeadlineTime('');
    setGoalAnalysis(null);
    setCurrentStep('input');
    setError(null);
    setSuccess(null);
    setEditingGoal(null); // Сбрасываем состояние редактирования
  };

  const renderInputStep = () => (
    <div className="card">
      <h3>{editingGoal ? 'Редактирование цели' : 'Создание цели'}</h3>
      <p className="muted">
        {editingGoal
          ? 'Измените данные цели. ИИ поможет проверить её на соответствие принципам SMART и предложит улучшения.'
          : 'Опишите вашу цель. ИИ поможет проверить её на соответствие принципам SMART и предложит улучшения.'
        }
      </p>

      {editingGoal && (
        <div className="editing-notice">
          <span>🔄 Вы редактируете существующую цель</span>
          <button className="btn-link" onClick={resetForm}>
            Отменить редактирование
          </button>
        </div>
      )}

      <div className="form-group">
        <label>Название цели *</label>
        <input
          type="text"
          className="input"
          value={form.title}
          placeholder="Например: Подготовить презентацию для команды"
          onChange={(e) => handleFieldChange('title', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Описание цели *</label>
        <textarea
          className="input"
          value={form.description}
          placeholder="Зачем эта цель важна и какой ожидаемый результат"
          onChange={(e) => handleFieldChange('description', e.target.value)}
          rows={3}
        />
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Приоритет</label>
          <select
            className="input"
            value={form.priority || 'medium'}
            onChange={(e) => handleFieldChange('priority', e.target.value)}
          >
            {priorityOptions.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Дедлайн</label>
          <div className="deadline-row">
            <input
              type="date"
              className="input"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
            <input
              type="time"
              className="input"
              value={deadlineTime}
              onChange={(e) => setDeadlineTime(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="wizard-actions">
        <button
          className="btn primary"
          onClick={handleAnalyzeGoal}
          disabled={!canAnalyze || analyzing}
        >
          {analyzing ? 'Анализируем...' : 'Получить анализ от ИИ'}
        </button>
      </div>
    </div>
  );

  const renderAnalysisStep = () => {
    if (!goalAnalysis) return null;

    return (
      <div className="card">
        <h3>Анализ цели от ИИ</h3>

        <div className="goal-score">
          <div className="score-circle">
            <span className="score-value">{goalAnalysis.score}</span>
            <span className="score-label">/ 100</span>
          </div>
          <div className="score-status">
            {goalAnalysis.is_smart ? (
              <span className="status-good">✅ Цель соответствует SMART</span>
            ) : (
              <span className="status-warning">⚠️ Цель требует доработки</span>
            )}
          </div>
        </div>

        <div className="analysis-details">
          <h4>Детальный анализ:</h4>
          {Object.entries(goalAnalysis.analysis).map(([key, analysis]) => (
            <div key={key} className="analysis-item">
              <div className="analysis-header">
                <span className="analysis-title">{getSmartLabel(key)}</span>
                <span className={`analysis-score ${analysis.score >= 80 ? 'good' : analysis.score >= 50 ? 'medium' : 'poor'}`}>
                  {analysis.score}/100
                </span>
              </div>
              <p className="analysis-feedback">{analysis.feedback}</p>
            </div>
          ))}
        </div>

        {goalAnalysis.suggestions.length > 0 && (
          <div className="suggestions">
            <h4>Рекомендации для улучшения:</h4>
            <ul>
              {goalAnalysis.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}

        {goalAnalysis.improved_goal && (
          <div className="improved-goal">
            <h4>Предлагаем��я улучшенная версия:</h4>
            <div className="improved-preview">
              <p><strong>Название:</strong> {goalAnalysis.improved_goal.title}</p>
              <p><strong>Описание:</strong> {goalAnalysis.improved_goal.description}</p>
            </div>
            <button className="btn secondary" onClick={applyImprovedGoal}>
              Применить улучшения
            </button>
          </div>
        )}

        {error && <div className="alert error">{error}</div>}

        <div className="wizard-actions">
          <button className="btn secondary" onClick={() => setCurrentStep('input')}>
            ← Вернуться к редактированию
          </button>
          <button
            className="btn primary"
            onClick={handleSaveGoal}
            disabled={saving}
          >
            {saving ? 'Сохраняем...' : 'Сохранить цель'}
          </button>
        </div>
      </div>
    );
  };

  const renderSavedStep = () => (
    <div className="card">
      <div className="success-message">
        <div className="success-icon">✅</div>
        <h3>Цель успешно сохранена!</h3>
        <p>Ваш�� SMART-цель добавлена и будет учитываться при анализе календаря.</p>

        <div className="wizard-actions">
          <button className="btn secondary" onClick={resetForm}>
            Создать ещё одну цель
          </button>
          <button className="btn primary" onClick={() => navigate('/profile')}>
            К профилю
          </button>
        </div>
      </div>
    </div>
  );

  const getSmartLabel = (key: string): string => {
    const labels: { [key: string]: string } = {
      specific: 'S — Конкретность',
      measurable: 'M — Измеримость',
      achievable: 'A — Достижимость',
      relevant: 'R — Актуальность',
      time_bound: 'T — Временные р��мки'
    };
    return labels[key] || key;
  };

  // Обработчик начала редактирования цели
  const handleEditGoal = (goal: SmartGoal) => {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      description: goal.description,
      deadline: goal.deadline ? new Date(goal.deadline).toISOString().slice(0, 10) : '',
      priority: goal.priority,
    });
    setCurrentStep('input');
  };

  // Обработчик подтверждения удаления цели
  const handleDeleteGoal = (goalId: string) => {
    setDeletingGoal(goalId);
    setShowDeleteConfirm(goalId);
  };

  // Обработчик отмены удаления цели
  const handleCancelDelete = () => {
    setShowDeleteConfirm(null);
    setDeletingGoal(null);
  };

  // Обработчик подтверждения удаления цели
  const handleConfirmDelete = async () => {
    if (!deletingGoal) return;

    setLoadingGoals(true);
    setError(null);

    try {
      // Удаляем цель на сервере
      await api.delete(`/ai/goals/${deletingGoal}`);

      setSuccess('Цель успешно удалена');
      // Обновляем список целей
      await loadGoals();
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить цель');
    } finally {
      setLoadingGoals(false);
      setShowDeleteConfirm(null);
      setDeletingGoal(null);
    }
  };

  return (
    <div className="goals-page">
      <div className="goals-header">
        <h2>Мои цели (SMART)</h2>
        <div className="goals-header-actions">
          <button className="link-btn" onClick={() => navigate('/profile')}>К профилю</button>
        </div>
      </div>

      <div className="goals-layout">
        <div className="wizard">
          <div className="steps">
            <div className={`step ${currentStep === 'input' ? 'active' : (currentStep === 'analysis' || currentStep === 'saved') ? 'done' : ''}`}>
              <span className="step-index">1</span>
              <span className="step-title">Заполнение цели</span>
            </div>
            <div className={`step ${currentStep === 'analysis' ? 'active' : currentStep === 'saved' ? 'done' : ''}`}>
              <span className="step-index">2</span>
              <span className="step-title">Анализ ИИ</span>
            </div>
          </div>

          {currentStep === 'input' && renderInputStep()}
          {currentStep === 'analysis' && renderAnalysisStep()}
          {currentStep === 'saved' && renderSavedStep()}

          {success && <div className="alert success">{success}</div>}
        </div>

        <div className="goals-list">
          <div className="goals-list-header">
            <h3>Существующие цели</h3>
            <div className="goals-list-header-actions">
              <button
                className="toggle-btn"
                onClick={() => setShowAllGoals(prev => !prev)}
                title={showAllGoals ? 'Показать только актуальные цели' : 'Показать все (включая просро��енные) цели'}
              >
                {showAllGoals ? 'Показать актуальные цели' : 'Показать все события'}
              </button>
              <button
                className="refresh-btn"
                onClick={() => loadGoals(showAllGoals)}
                disabled={loadingGoals}
                title="Обновить список целей"
              >
                {loadingGoals ? '🔄' : '↻'}
              </button>
            </div>
          </div>
          {loadingGoals ? (
            <p>Загружаем цели...</p>
          ) : goals.length === 0 ? (
            <p className="muted">Пока нет сохранённых целей</p>
          ) : (
            <div className="goals-grid">
              {goals.map((goal) => (
                <div key={goal.id} className="goal-card">
                  <h4>{goal.title}</h4>
                  <p className="muted">{goal.description}</p>
                  <div className="goal-meta">
                    <span className={`priority priority-${goal.priority}`}>
                      {priorityOptions.find(p => p.value === goal.priority)?.label}
                    </span>
                    {goal.deadline && (
                      <span className="deadline">
                        до {new Date(goal.deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>

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

                  <div className="goal-actions">
                    <button className="btn edit" onClick={() => handleEditGoal(goal)}>
                      ✏️ Редактировать
                    </button>
                    <button
                      className="btn delete"
                      onClick={() => goal.id && handleDeleteGoal(goal.id)}
                      disabled={!goal.id}
                    >
                      🗑️ Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно подтверждения удаления цели */}
      {showDeleteConfirm && (
        <div className="modal">
          <div className="modal-content">
            <h3>Подтвержде��ие удаления</h3>
            <p>Вы уверены, что хотите удалить эту цель? Это действие нельзя будет отменить.</p>
            <div className="modal-actions">
              <button className="btn cancel" onClick={handleCancelDelete}>
                Отмена
              </button>
              <button className="btn confirm" onClick={handleConfirmDelete} disabled={loadingGoals}>
                {loadingGoals ? 'Удаляем...' : 'Удалить цель'}
              </button>
            </div>
            {error && <div className="alert error">{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Goals;

