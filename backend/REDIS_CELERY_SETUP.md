# AI Calendar - Redis Cache & Celery Webhooks Setup

## Обзор изменений

Ваш AI календарь теперь настроен с:

1. **Redis кеширование** с TTL 6 минут для всех данных календаря
2. **Celery** для асинхронной обработки вебхуков Google Calendar
3. **Автоматическая инвалидация кеша** при получении вебхуков

## Установка и запуск

### 1. Установка зависимостей

```bash
cd backend
pip install celery redis
```

### 2. Настройка Redis

Убедитесь, что Redis запущен на localhost:6379 или обновите настройки в `.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
CACHE_TTL_SECONDS=360  # 6 минут
```

### 3. Запуск компонентов

#### Терминал 1 - FastAPI сервер
```bash
cd backend/app
uvicorn main:app --reload
```

#### Терминал 2 - Celery Worker
```bash
cd backend/app
python celery_worker.py
```

#### Терминал 3 - Celery Flower (опционально, для мониторинга)
```bash
cd backend/app
celery -A celery_app flower
```

## Как это работает

### Кеширование (TTL 6 минут)

- **События календаря**: `calendar:events:{user_id}`
- **Отдельные события**: `calendar:event:{user_id}:{event_id}`
- **Список календарей**: `calendar:user_calendars:{user_id}`
- **Sync токены**: `calendar:sync_token:{user_id}`

### Обработка вебхуков

1. **Получение вебхука**: `POST /webhook/google-calendar`
   - Быстро возвращает `202 Accepted`
   - Отправляет задачу в Celery очередь

2. **Celery обработка**:
   - Получает user_id по channel_id
   - Выполняет инкрементальную синхронизацию
   - Обновляет БД и инвалидирует кеш
   - Повторяет при ошибках (до 3 раз)

3. **Обновление данных**:
   - Данные в БД обновляются
   - Кеш инвалидируется
   - При следующем запросе данные заново кешируются

## API эндпоинты

### Вебхуки
- `POST /webhook/google-calendar` - Получение вебхука от Google
- `POST /webhook/setup/{user_id}` - Настройка подписки на вебхуки
- `DELETE /webhook/unsubscribe/{channel_id}` - Отписка от вебхука
- `GET /webhook/status/{user_id}` - Статус подписок пользователя
- `GET /webhook/task-status/{task_id}` - Статус выполнения Celery задачи

### Пример использования

```python
# Настройка вебхука для пользователя
curl -X POST "http://localhost:8000/webhook/setup/user123"

# Проверка статуса задачи
curl "http://localhost:8000/webhook/task-status/task-id-here"
```

## Мониторинг

### Celery задачи
- Логи пишутся в консоль Celery worker
- Статус задач можно проверить через API
- Повторы при ошибках с экспоненциальной задержкой

### Redis кеш
```bash
# Подключение к Redis CLI
redis-cli

# Просмотр всех ключей календаря
KEYS calendar:*

# Проверка TTL ключа
TTL calendar:events:user123

# Очистка кеша пользователя
DEL calendar:events:user123
DEL calendar:user_calendars:user123
```

## Преимущества новой архитектуры

1. **Производительность**: Кеш 6 минут значительно ускоряет ответы API
2. **Надежность**: Асинхронная обработка вебхуков не блокирует Google
3. **Масштабируемость**: Celery позволяет горизонтальное масштабирование
4. **Актуальность данных**: Автоматическое обновление при изменениях в календаре

## Отладка

### Проблемы с кешем
```python
# В коде можно принудительно очистить кеш
await calendar_service.cache_service.invalidate_user_cache(user_id)
```

### Проблемы с Celery
- Проверьте подключение к Redis
- Убедитесь, что Celery worker запущен
- Посмотрите логи в консоли worker
