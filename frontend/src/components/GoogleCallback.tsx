import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';
import './GoogleCallback.css';

const GoogleCallback: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const steps = [
    'Подтверждаем учетную запись…',
    'Синхронизируем Google Календарь…',
    'Проверяем активные токены…',
    'Анализируем цели (SMART)…',
    'Готовим персональные рекомендации…'
  ];

  useEffect(() => {
    // Цикл смены сообщений пока идет авторизация
    if (loading && !error) {
      const id = setInterval(() => {
        setStepIndex(prev => (prev + 1) % steps.length);
      }, 1800);
      return () => clearInterval(id);
    }
  }, [loading, error, steps.length]);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          setError('Авторизация отменена или произошла ошибка');
          setLoading(false);
          return;
        }
        if (!code) {
          setError('Код авторизации не найден');
          setLoading(false);
          return;
        }

        const authData = await authService.handleGoogleCallback(code);
        // Небольшая пауза для UX + гарантии записи
        await new Promise(r => setTimeout(r, 400));
        window.location.href = '/profile';
      } catch (err: any) {
        setError(`Ошибка при авторизации: ${err.response?.data?.detail || err.message}`);
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (loading) {
    const progress = ((stepIndex + 1) / steps.length) * 100;
    return (
      <div className="auth-progress-root" role="status" aria-live="polite">
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />
        <div className="bg-noise-layer" />
        <div className="auth-card fade-in">
          <h1 className="auth-title">AI&nbsp;Calendar</h1>
          <div className="loader-cluster">
            <div className="spinner-ring" aria-hidden />
            <div className="progress-steps-text">{steps[stepIndex]}</div>
            <div className="progress-bar" aria-label="Прогресс авторизации">
              <div className="progress-fill" style={{ width: progress + '%' }} />
            </div>
            <div className="hint-text">Проверяем доступ и подготавливаем рабочее пространство…</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-progress-root error-state">
        <div className="auth-card fade-in">
          <h1 className="auth-title small">AI&nbsp;Calendar</h1>
          <div className="error-box">
            <p>{error}</p>
            <div className="error-actions">
              <button className="btn retry" onClick={() => navigate('/login')}>Повторить вход</button>
              <button className="btn ghost" onClick={() => window.location.reload()}>Обновить</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default GoogleCallback;
