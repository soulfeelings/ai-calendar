import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiService, SmartGoal } from '../services/aiService';
import './Goals.css';

interface StepField {
  key: keyof Omit<SmartGoal, 'id' | 'status' | 'deadline'>;
  label: string;
  placeholder: string;
}

const steps: Array<{
  id: string;
  title: string;
  description?: string;
  fields?: StepField[];
}> = [
  {
    id: 'intro',
    title: 'SMART цель',
    description:
      'Ответьте на несколько вопросов. Мы оформим цель по SMART и поможем встроить её в календарь.',
    fields: [
      { key: 'title', label: 'Название', placeholder: 'Например: Подготовить презентацию для команды' },
      { key: 'description', label: 'Краткое описание', placeholder: 'Зачем и какой ожидаемый результат' },
    ],
  },
  {
    id: 'specific',
    title: 'S — Specific (Конкретность)',
    fields: [
      { key: 'specific', label: 'Что именно вы хотите достичь?', placeholder: 'Опишите максимально конкретно' },
    ],
  },
  {
    id: 'measurable',
    title: 'M — Measurable (Измеримость)',
    fields: [
      { key: 'measurable', label: 'Как вы поймёте, что цель достигнута?', placeholder: 'Метрики/критерии успеха' },
    ],
  },
  {
    id: 'achievable',
    title: 'A — Achievable (Достижимость)',
    fields: [
      { key: 'achievable', label: 'Что поможет достичь цели?', placeholder: 'Ресурсы, навыки, шаги' },
    ],
  },
  {
    id: 'relevant',
    title: 'R — Relevant (Актуальность)',
    fields: [
      { key: 'relevant', label: 'Почему это важно сейчас?', placeholder: 'Связь с приоритетами/ценностями' },
    ],
  },
  {
    id: 'time_bound',
    title: 'T — Time-bound (Сроки)',
    fields: [
      { key: 'time_bound', label: 'Какой у цели срок?', placeholder: 'Сроки/вехи, ограничения по времени' },
    ],
  },
];

const priorityOptions = [
  { value: 'high', label: 'Высокий' },
  { value: 'medium', label: 'Средний' },
  { value: 'low', label: 'Низкий' },
];

const Goals: React.FC = () => {
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [goals, setGoals] = useState<SmartGoal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);

  const currentStep = steps[stepIndex];

  const canGoNext = useMemo(() => {
    // Минимальная валидация на каждом шаге: поля текущего шага не пустые
    if (!currentStep.fields) return true;
    return currentStep.fields.every((f) => String((form as any)[f.key] || '').trim().length > 0);
  }, [currentStep, form]);

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

  const handleFieldChange = (key: StepField['key'], value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const next = () => {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const handleSubmit = async () => {
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
      // Обновляем список
      await loadGoals();
      // Сброс формы
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
      setStepIndex(0);
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить цель');
    } finally {
      setSaving(false);
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
            {steps.map((s, idx) => (
              <div key={s.id} className={`step ${idx === stepIndex ? 'active' : ''} ${idx < stepIndex ? 'done' : ''}`}>
                <span className="step-index">{idx + 1}</span>
                <span className="step-title">{s.title}</span>
              </div>
            ))}
            <div className={`step ${stepIndex === steps.length ? 'active' : ''}`}>
              <span className="step-index">{steps.length + 1}</span>
              <span className="step-title">Приоритет и дедлайн</span>
            </div>
          </div>

          <div className="card">
            <h3>{currentStep.title}</h3>
            {currentStep.description && <p className="muted">{currentStep.description}</p>}

            {currentStep.fields?.map((f) => (
              <div className="form-group" key={f.key as string}>
                <label>{f.label}</label>
                <textarea
                  className="input"
                  value={(form as any)[f.key] || ''}
                  placeholder={f.placeholder}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  rows={f.key === 'description' ? 3 : 2}
                />
              </div>
            ))}

            {/* Последний объединенный шаг: приоритет + дедлайн */}
            {stepIndex === steps.length - 1 && (
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
            )}

            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <div className="wizard-actions">
              <button className="btn secondary" onClick={prev} disabled={stepIndex === 0}>Назад</button>
              {stepIndex < steps.length - 1 ? (
                <button className="btn primary" onClick={next} disabled={!canGoNext}>Далее</button>
              ) : (
                <button className="btn primary" onClick={handleSubmit} disabled={!canGoNext || saving}>
                  {saving ? 'Сохраняем...' : 'Сохранить цель'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="goals-list">
          <div className="card">
            <div className="list-header">
              <h3>Текущие цели</h3>
              <button className="link-btn" onClick={loadGoals} disabled={loadingGoals}>
                {loadingGoals ? 'Обновляем...' : 'Обновить'}
              </button>
            </div>

            {goals.length === 0 ? (
              <p className="muted">Пока нет целей. Создайте первую справа.</p>
            ) : (
              <ul className="items">
                {goals.map((g) => (
                  <li key={g.id || g.title} className="item">
                    <div className={`prio prio-${g.priority || 'medium'}`} />
                    <div className="item-main">
                      <div className="item-title">{g.title}</div>
                      <div className="item-desc">{g.description}</div>
                      <div className="item-meta">
                        <span>S</span> {g.specific} · <span>M</span> {g.measurable} · <span>A</span> {g.achievable} · <span>R</span> {g.relevant} · <span>T</span> {g.time_bound}
                      </div>
                    </div>
                    {g.deadline && (
                      <div className="item-deadline">
                        Дедлайн:
                        <br />
                        {new Date(g.deadline).toLocaleString('ru-RU', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Goals;
