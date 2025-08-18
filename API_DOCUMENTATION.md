## Обзор

**Базовый URL**: `http://localhost:8000` (для разработки)

**Архитектура**: FastAPI + PostgreSQL + Redis + Celery + OpenAI

## Аутентификация

Все эндпоинты (кроме Google OAuth) требуют Bearer токен в заголовке Authorization:
```
Authorization: Bearer <access_token>
```

---

## 1. Аутентификация (`/auth`)

### GET `/auth/me`
Получение информации о текущем пользователе.

**Ответ:**
```json
{
  "id": "user_id",
  "email": "user@example.com",
  "name": "Имя Пользователя",
  "picture": "https://example.com/photo.jpg"
}
```

### POST `/auth/refresh`
Обновление access token с помощью refresh token.

**Запрос:**
```json
{
  "refresh_token": "refresh_token_value"
}
```

**Ответ:**
```json
{
  "access_token": "new_access_token",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### GET `/auth/validate`
Проверка валидности текущего access token.

**Ответ:**
```json
true
```

### POST `/auth/logout`
Выход из системы (отзыв токенов).

**Ответ:**
```json
{
  "message": "Successfully logged out"
}
```

---

## 2. Google OAuth (`/google`)

### GET `/google/`
Редирект на страницу авторизации Google.

**Ответ:** HTTP 302 редирект на Google OAuth

### POST `/google/callback`
Обработка callback от Google OAuth.

**Запрос:**
```json
{
  "code": "authorization_code_from_google"
}
```

**Ответ:**
```json
{
  "access_token": "access_token",
  "refresh_token": "refresh_token",
  "user_info": {

### POST `/google/refresh_access_token`
Обновление Google access token для доступа к Calendar API.

**Ответ:**
```json
{
  "access_token": "new_google_access_token",
  "expires_in": 3600
}
```

---

## 3. Google Calendar (`/calendar`)

### GET `/calendar/list`
Получение списка календарей пользователя.

**Ответ:**
```json
{
  "calendars": [
    {
      "id": "calendar_id",
      "summary": "Название календаря",
      "primary": true,
      "accessRole": "owner"
    }
  ]
}
```

### POST `/calendar/code`
Обновление разрешений (scope) для доступа к календарю.

**Запрос:**
```json
{
  "code": "authorization_code_with_calendar_scope"
}
```

### GET `/calendar/events`
Получение всех событий календаря.

**Параметры:**
- `forcefullsync` (bool, optional): Принудительная синхронизация
- `fullresponse` (bool, optional): Полный ответ с метаданными

**Ответ:**
```json
{
  "events": [
    {
      "id": "event_id",
      "summary": "Название события",
      "description": "Описание",
      "start": {
        "dateTime": "2025-01-15T10:00:00+03:00",
        "timeZone": "Europe/Moscow"
      },
      "end": {
        "dateTime": "2025-01-15T11:00:00+03:00",
        "timeZone": "Europe/Moscow"
      },
      "location": "Офис",
      "attendees": [
        {
          "email": "attendee@example.com",
          "responseStatus": "accepted"
        }
      ]
    }
  ]
}
```

### GET `/calendar/event/{event_id}`
Получение конкретного события по ID.

**Ответ:** Объект события (см. структуру выше)

### PATCH `/calendar/event/{event_id}`
Обновление события. Все поля опциональные.

**Запрос:**
```json
{
  "summary": "Новое название",
  "description": "Новое описание",
  "start": {
    "dateTime": "2025-01-15T10:00:00+03:00",
    "timeZone": "Europe/Moscow"
  },
  "end": {
    "dateTime": "2025-01-15T11:00:00+03:00",
    "timeZone": "Europe/Moscow"
  },
  "location": "Новое место",
  "attendees": [
    {
      "email": "new@example.com"
    }
  ]
}
```

**Ответ:**
```json
{
  "status": "success",
  "event_id": "event_id",
  "updated_fields": ["summary", "location"],
  "message": "Event updated successfully"
}
```

### PATCH `/calendar/events/bulk`
Массовое обновление нескольких событий.

**Запрос:**
```json
[
  {
    "event_id": "event1_id",
    "update_data": {
      "summary": "Обновленное название 1"
    }
  },
  {
    "event_id": "event2_id", 
    "update_data": {
      "location": "Новое место"
    }
  }
]
```

**Ответ:**
```json
[
  {
    "status": "success",
    "event_id": "event1_id",
    "updated_fields": ["summary"],
    "message": "Event updated successfully"
  },
  {
    "status": "success", 
    "event_id": "event2_id",
    "updated_fields": ["location"],
    "message": "Event updated successfully"
  }
]
```

### POST `/calendar/webhook-setup`
Настройка подписки на вебхуки для автоматического обновления календаря.

**Ответ:**
```json
{
  "channel_id": "webhook_channel_id",
  "resource_id": "resource_id",
  "expiration": "2025-01-22T10:00:00Z"
}
```

### GET `/calendar/cache/stats`
Получение статистики кеша пользователя.

**Ответ:**
```json
{
  "cached_events": 25,
  "cache_hit_ratio": 0.85,
  "last_sync": "2025-01-15T09:30:00Z"
}
```

### DELETE `/calendar/cache/clear`
Очистка кеша пользователя.

**Ответ:**
```json
{
  "status": "success",
  "message": "User cache cleared successfully"
}
```

---

## 4. Вебхуки (`/webhook`)

### POST `/webhook/google-calendar`
Обработчик вебхуков от Google Calendar (используется Google, не клиентом).

**Заголовки:**
- `X-Goog-Channel-Id`: ID канала
- `X-Goog-Resource-State`: Состояние ресурса
- `X-Goog-Resource-Id`: ID ресурса

### POST `/webhook/setup/{user_id}`
Настройка подписки на вебхуки для пользователя.

### DELETE `/webhook/unsubscribe/{channel_id}`
Отписка от вебхука.

### GET `/webhook/status/{user_id}`
Получение статуса подписки на вебхуки.

---

## 5. AI Анализ календаря (`/ai`)

### POST `/ai/analyze-calendar`
Анализ календаря и SMART целей с помощью ИИ.

**Запрос:**
```json
{
  "calendar_events": [
    {
      "id": "event_id",
      "summary": "Встреча с командой",
      "start": "2025-01-15T10:00:00+03:00",
      "end": "2025-01-15T11:00:00+03:00",
      "location": "Офис"
    }
  ],
  "user_goals": [
    {
      "title": "Изучить Python",
      "specific": "Пройти онлайн курс по Python",
      "measurable": "Завершить 20 уроков",
      "achievable": "По 2 урока в неделю",
      "relevant": "Для карьерного роста",
      "time_bound": "2025-03-01T00:00:00Z",
      "priority": 3
    }
  ],
  "analysis_period_days": 7
}
```

**Ответ:**
```json
{
  "analysis": "Анализ вашего расписания показывает...",
  "recommendations": [
    "Добавьте 2 часа в неделю для изучения Python",
    "Перенесите встречу на более удобное время"
  ],
  "schedule_changes": [
    {
      "action": "create",
      "title": "Изучение Python",
      "start_time": "2025-01-16T19:00:00+03:00",
      "end_time": "2025-01-16T21:00:00+03:00",
      "reason": "Время для достижения цели изучения Python"
    }
  ],
  "goal_alignment": "Хорошо",
  "productivity_score": 7
}
```

### POST `/ai/plan-goal`
Планирование расписания для конкретной SMART цели.

**Запрос:**
```json
{
  "goal": {
    "title": "Изучить Python",
    "specific": "Пройти онлайн курс",
    "measurable": "20 уроков",
    "achievable": "2 урока в неделю",
    "relevant": "Для работы",
    "time_bound": "2025-03-01T00:00:00Z",
    "priority": 3
  },
  "free_time_slots": [
    {
      "start": "2025-01-15T19:00:00+03:00",
      "end": "2025-01-15T22:00:00+03:00",
      "duration_minutes": 180
    }
  ],
  "context": "Предпочитаю заниматься вечером"
}
```

**Ответ:**
```json
{
  "suggested_time": "Вторник и четверг с 19:00 до 21:00",
  "duration": "2 часа за сессию",
  "frequency": "2 раза в неделю",
  "reasoning": "Вечернее время подходит для концентрированного изучения",
  "suggested_events": [
    {
      "title": "Python - Урок 1",
      "description": "Изучение основ Python",
      "start_time": "2025-01-16T19:00:00+03:00",
      "end_time": "2025-01-16T21:00:00+03:00",
      "priority": 3
    }
  ]
}
```

### POST `/ai/chat`
Прямое общение с ИИ для консультаций по тайм-менеджменту.

**Запрос:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Как лучше планировать время для изучения программирования?"
    }
  ],
  "model": "gpt-4",
  "max_tokens": 1000,
  "temperature": 0.7
}
```

**Ответ:**
```json
{
  "content": "Для эффективного изучения программирования рекомендую...",
  "tokens_used": 150,
  "model": "gpt-4",
  "created": 1705312345
}
```

### POST `/ai/goals`
Создание новой SMART цели.

**Запрос:**
```json
{
  "title": "Выучить французский язык",
  "description": "Достичь уровня B1",
  "specific": "Изучать французский с помощью Duolingo и учебников",
  "measurable": "Проходить 1 урок в день и изучать 10 новых слов",
  "achievable": "30 минут в день",
  "relevant": "Для путешествий и работы",
  "time_bound": "2025-12-31T23:59:59Z",
  "priority": 2
}
```

**Ответ:**
```json
{
  "id": "goal_123",
  "user_id": "user_456",
  "title": "Выучить французский язык",
  "description": "Достичь уровня B1",
  "specific": "Изучать французский с помощью Duolingo и учебников",
  "measurable": "Проходить 1 урок в день и изучать 10 новых слов",
  "achievable": "30 минут в день",
  "relevant": "Для путешествий и работы",
  "time_bound": "2025-12-31T23:59:59Z",
  "priority": 2,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z",
  "is_completed": false
}
```

### GET `/ai/goals`
Получение всех SMART целей пользователя.

**Параметры:**
- `include_completed` (bool): Включать выполненные цели

**Ответ:**
```json
[
  {
    "id": "goal_123",
    "title": "Выучить французский язык",
    "description": "Достичь уровня B1",
    "specific": "Изучать французский с помощью Duolingo",
    "measurable": "1 урок в день",
    "achievable": "30 минут в день",
    "relevant": "Для работы",
    "time_bound": "2025-12-31T23:59:59Z",
    "priority": 2,
    "created_at": "2025-01-15T10:00:00Z",
    "is_completed": false
  }
]
```

---

## Коды ошибок

### Стандартные HTTP коды:
- `200` - Успешный запрос
- `201` - Ресурс создан
- `400` - Некорректный запрос
- `401` - Не авторизован
- `403` - Доступ запрещен
- `404` - Ресурс не найден
- `500` - Внутренняя ошибка сервера

### Пример ошибки:
```json
{
  "detail": "Описание ошибки"
}
```

---

## Модели данных

### SMART Цель
```json
{
  "id": "string",
  "user_id": "string", 
  "title": "string",
  "description": "string",
  "specific": "string",
  "measurable": "string", 
  "achievable": "string",
  "relevant": "string",
  "time_bound": "2025-01-15T00:00:00Z",
  "priority": 1,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z", 
  "is_completed": false
}
```

### Событие календаря
```json
{
  "id": "string",
  "summary": "string",
  "description": "string",
  "start": {
    "dateTime": "2025-01-15T10:00:00+03:00",
    "timeZone": "Europe/Moscow"
  },
  "end": {
    "dateTime": "2025-01-15T11:00:00+03:00", 
    "timeZone": "Europe/Moscow"
  },
  "location": "string",
  "attendees": [
    {
      "email": "user@example.com",
      "displayName": "Имя",
      "responseStatus": "accepted"
    }
  ]
}
```

---

## Примеры использования

### 1. Полный цикл работы с AI календарем:

```bash
# 1. Авторизация через Google
GET /google/

# 2. Обработка callback
POST /google/callback
{"code": "google_auth_code"}

# 3. Получение событий календаря
GET /calendar/events

# 4. Создание SMART цели
POST /ai/goals
{"title": "Изучить React", ...}

# 5. Анализ календаря с целями
POST /ai/analyze-calendar
{"calendar_events": [...], "user_goals": [...]}

# 6. Применение рекомендаций ИИ
PATCH /calendar/event/{event_id}
{"summary": "Новое название встречи"}
```

### 2. Настройка автоматических обновлений:

```bash
# Настройка вебхуков
POST /calendar/webhook-setup

# Проверка статуса
GET /webhook/status/{user_id}
```

---

## Безопасность

- Все данные передаются по HTTPS
- Используется OAuth 2.0 для авторизации
- Access токены имеют ограниченный срок действия
- Refresh токены хранятся в безопасном хранилище
- Вебхуки проверяются на подлинность

---

## Ограничения

- Максимум 30 дней для анализа календаря
- Лимит токенов OpenAI API
- Ограничения Google Calendar API (квоты)
- Максимум 100 событий за один запрос

---

## Техническая информация

**Стек технологий:**
- FastAPI (Python веб-фреймворк)
- PostgreSQL (основная база данных)
- Redis (кеширование и очереди)
- Celery (асинхронные задачи)
- OpenAI API (анализ ИИ)
- Google Calendar API (интеграция с календарем)

**Дополнительные возможности:**
- Автоматическая синхронизация через вебхуки
- Кеширование для повышения производительности
- Асинхронная обработка задач
- Мониторинг и логирование
