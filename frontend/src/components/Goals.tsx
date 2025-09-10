import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiService, SmartGoal, GoalAnalysis } from '../services/aiService';
import './Goals.css';

const priorityOptions = [
  { value: 'high', label: 'Высокий' },
  { value: 'medium', label: 'Средний' },
  { value: 'low', label: 'Низкий' },
];

const Goals: React.FC = () => {
  const navigate = useNavigate();

  // С����остояние этапов: 'input' | 'analysis' | 'saved'
  const [currentStep, setCurrentStep] = useState<'input' | 'analysis' | 'saved'>('input');

  const [form, setForm] = useState<SmartGoal>({
    title: '',
    description: '',
    specific: '',
    measurable: '',
    achievable: '',
    relevant: '',
    time_bound: '',
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

  // Проверяем, заполнены ли основные поля для получения анализа
  const canAnalyze = form.title.trim().length > 0 && form.description.trim().length > 0;

  const loadGoals = async () => {
    try {
      setLoadingGoals(true);
      const list = await aiService.getGoals(false);
      setGoals(list || []);
    } catch (e) {
      // Молча, список не критичен для создания
    } finally {
      setLoadingGoals(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleFieldChange = (key: keyof SmartGoal, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAnalyzeGoal = async () => {
    if (!canAnalyze) return;

    setError(null);
    setAnalyzing(true);

    try {
      const analysis = await aiService.analyzeGoal(form);
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
        specific: goalAnalysis.improved_goal!.specific,
        measurable: goalAnalysis.improved_goal!.measurable,
        achievable: goalAnalysis.improved_goal!.achievable,
        relevant: goalAnalysis.improved_goal!.relevant,
        time_bound: goalAnalysis.improved_goal!.time_bound,
      }));
      // Возвращаемся к форме для редактирования
      setCurrentStep('input');
      setGoalAnalysis(null);
    }
  };

  const editGoal = () => {
    // Возвращаемся к форме редактирования с текущими данными
    setCurrentStep('input');
    setGoalAnalysis(null);
  };

  const handleSaveGoal = async () => {
    setError(null);
    setSuccess(null);

    // Собираем deadline в ISO, если дата указана
    let deadlineISO: string | undefined = undefined;
    if (deadlineDate) {
      deadlineISO = new Date(`${deadlineDate}T${deadlineTime || '23:59'}:00`).toISOString();
    }

    const payload: SmartGoal = {
      ...form,
      deadline: deadlineISO,
    };

    try {
      setSaving(true);
      await aiService.createSMARTGoal(payload);
      setSuccess('Цель сохранена');
      setCurrentStep('saved');
      // Обновляем список
      await loadGoals();
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить цель');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      specific: '',
      measurable: '',
      achievable: '',
      relevant: '',
      time_bound: '',
      deadline: '',
      priority: 'medium',
    });
    setDeadlineDate('');
    setDeadlineTime('');
    setGoalAnalysis(null);
    setCurrentStep('input');
    setError(null);
    setSuccess(null);
  };

  const renderInputStep = () => (
    <div className="card">
      <h3>Создание цели</h3>
      <p className="muted">
        Опишите вашу цель. ИИ поможет проверить её на соответствие принципам SMART и предложит улучшения.
      </p>

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

      <div className="form-group">
        <label>Конкретность (Specific)</label>
        <textarea
          className="input"
          value={form.specific}
          placeholder="Что именно вы хотите достичь?"
          onChange={(e) => handleFieldChange('specific', e.target.value)}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label>Измеримость (Measurable)</label>
        <textarea
          className="input"
          value={form.measurable}
          placeholder="Как вы поймёте, что цель достигнута?"
          onChange={(e) => handleFieldChange('measurable', e.target.value)}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label>Достижимость (Achievable)</label>
        <textarea
          className="input"
          value={form.achievable}
          placeholder="Что поможет достичь цели? Какие ресурсы нужны?"
          onChange={(e) => handleFieldChange('achievable', e.target.value)}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label>Актуальность (Relevant)</label>
        <textarea
          className="input"
          value={form.relevant}
          placeholder="Почему это важно сейчас?"
          onChange={(e) => handleFieldChange('relevant', e.target.value)}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label>Временные рамки (Time-bound)</label>
        <textarea
          className="input"
          value={form.time_bound}
          placeholder="Какой у цели срок? Промежуточные вехи?"
          onChange={(e) => handleFieldChange('time_bound', e.target.value)}
          rows={2}
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
          <label>Дедлайн (необязательно)</label>
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
            <h4>Предлагаемая улучшенная версия:</h4>
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
        <p>Ваша SMART-цель добавлена и будет учитываться при анализе календаря.</p>

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
      time_bound: 'T — Временные рамки'
    };
    return labels[key] || key;
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
            <button
              className="refresh-btn"
              onClick={loadGoals}
              disabled={loadingGoals}
              title="Обновить список целей"
            >
              {loadingGoals ? '🔄' : '↻'}
            </button>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Goals;
