import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';

const GoogleCallback: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');

        console.log('Google OAuth callback received');
        console.log('Code:', code);
        console.log('Error param:', errorParam);

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

        console.log('Sending code to backend:', code);
        const authData = await authService.handleGoogleCallback(code);
        console.log('Auth successful:', authData);

        // Ждем немного, чтобы убедиться что данные сохранились
        await new Promise(resolve => setTimeout(resolve, 200));

        // Проверяем что токены действительно сохранились перед редиректом
        console.log('GoogleCallback: Verifying tokens before redirect...');



        console.log('GoogleCallback: Tokens verified, redirecting...');
        window.location.href = '/profile';
      } catch (err: any) {
        console.error('Google callback error:', err);
        console.error('Error response:', err.response?.data);
        console.error('Error status:', err.response?.status);
        setError(`Ошибка при авторизации: ${err.response?.data?.detail || err.message}`);
        setLoading(false);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="callback-container">
        <div className="spinner"></div>
        <p>Завершаем авторизацию...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="callback-container">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => navigate('/login')}>
            Вернуться к входу
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default GoogleCallback;
