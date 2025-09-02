import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { calendarService } from '../services/calendarService';

const CalendarCallback: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        console.log('Calendar OAuth callback received');
        console.log('Code:', code);
        console.log('Error param:', errorParam);

        if (errorParam) {
          setError('Авторизация календаря отменена или произошла ошибка');
          setLoading(false);
          return;
        }

        if (!code) {
          setError('Код авторизации календаря не найден');
          setLoading(false);
          return;
        }

        console.log('Sending calendar code to backend:', code);
        await calendarService.sendCalendarCode(code);
        console.log('Calendar auth successful');
        
        // Редиректим обратно в профиль
        navigate('/profile');
      } catch (err: any) {
        console.error('Calendar callback error:', err);
        console.error('Error response:', err.response?.data);
        console.error('Error status:', err.response?.status);
        console.error('Full error object:', JSON.stringify(err, null, 2));

        // Лучшая обработка ошибок
        let errorMessage = 'Ошибка при авторизации календаря';

        if (err.response?.data?.detail) {
          if (typeof err.response.data.detail === 'string') {
            errorMessage += `: ${err.response.data.detail}`;
          } else {
            errorMessage += `: ${JSON.stringify(err.response.data.detail)}`;
          }
        } else if (err.message) {
          errorMessage += `: ${err.message}`;
        }

        setError(errorMessage);
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="callback-container">
        <div className="spinner"></div>
        <p>Настраиваем доступ к календарю...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="callback-container">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => navigate('/profile')}>
            Вернуться в профиль
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default CalendarCallback;
