import { CalendarEvent } from './calendarService';

interface CachedEvents {
  events: CalendarEvent[];
  timestamp: number;
  etag?: string;
}

class EventCacheService {
  private static readonly CACHE_KEY = 'calendar_events_cache';
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 минут в миллисекундах

  // Проверить, есть ли валидный кеш
  hasValidCache(): boolean {
    const cached = this.getCachedEvents();
    if (!cached) return false;

    const now = Date.now();
    const isValid = (now - cached.timestamp) < EventCacheService.CACHE_DURATION;

    if (!isValid) {
      this.clearCache();
    }

    return isValid;
  }

  // Получить события из кеша
  getCachedEvents(): CachedEvents | null {
    try {
      const cached = localStorage.getItem(EventCacheService.CACHE_KEY);
      if (!cached) return null;

      return JSON.parse(cached);
    } catch (error) {
      console.error('Error reading events cache:', error);
      this.clearCache();
      return null;
    }
  }

  // Сохранить события в кеш
  setCachedEvents(events: CalendarEvent[], etag?: string): void {
    try {
      const cacheData: CachedEvents = {
        events,
        timestamp: Date.now(),
        etag
      };

      localStorage.setItem(EventCacheService.CACHE_KEY, JSON.stringify(cacheData));
      console.log('Events cached successfully, count:', events.length);
    } catch (error) {
      console.error('Error caching events:', error);
    }
  }

  // Получить только события из кеша
  getEventsFromCache(): CalendarEvent[] {
    const cached = this.getCachedEvents();
    return cached ? cached.events : [];
  }

  // Сравнить новые события с кешированными и обновить кеш
  updateEventsCache(newEventsResponse: { items?: CalendarEvent[]; events?: CalendarEvent[]; etag?: string }): {
    updatedEvents: CalendarEvent[];
    hasChanges: boolean;
  } {
    const newEvents = newEventsResponse.items || newEventsResponse.events || [];
    const cachedData = this.getCachedEvents();

    if (!cachedData) {
      // Если кеша нет, сохраняем новые события (даже если их 0)
      this.setCachedEvents(newEvents, newEventsResponse.etag);
      return {
        updatedEvents: newEvents,
        hasChanges: true
      };
    }

    // ИСПРАВЛЕНИЕ: Если новый ответ пустой и это инкрементальное обновление,
    // значит нет изменений - возвращаем кешированные события БЕЗ очистки кеша
    if (newEvents.length === 0 && !newEventsResponse.items?.length && !newEventsResponse.events?.length) {
      console.log('No events in incremental update response, keeping cached events');
      // Обновляем только timestamp кеша чтобы продлить его валидность
      const updatedCacheData = {
        ...cachedData,
        timestamp: Date.now(),
        etag: newEventsResponse.etag || cachedData.etag
      };
      localStorage.setItem(EventCacheService.CACHE_KEY, JSON.stringify(updatedCacheData));

      return {
        updatedEvents: cachedData.events,
        hasChanges: false
      };
    }

    // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Умное обновление кеша
    // Если пришли новые события, это может быть либо полная синхронизация, либо инкрементальное обновление
    const cachedEvents = cachedData.events;
    let mergedEvents: CalendarEvent[];
    let hasChanges = false;

    // ИСПРАВЛЕНИЕ: Более точное определение типа синхронизации с детальным логированием
    const hasNextSyncToken = !!(newEventsResponse as any).nextSyncToken;
    const isCacheEmpty = cachedEvents.length === 0;
    const isManyEvents = newEvents.length > 20;

    console.log('Sync type analysis:', {
      newEventsCount: newEvents.length,
      cachedEventsCount: cachedEvents.length,
      hasNextSyncToken,
      isCacheEmpty,
      isManyEvents,
      etag: newEventsResponse.etag
    });

    const isFullSync = (
      // Явный признак полной синхронизации
      hasNextSyncToken ||
      // Первая загрузка (кеш пустой)
      (isCacheEmpty && newEvents.length > 0) ||
      // Принудительная синхронизация (когда запрашивается forcefullsync)
      isManyEvents
    );

    console.log(`Determined sync type: ${isFullSync ? 'FULL SYNC' : 'INCREMENTAL UPDATE'}`);

    if (isFullSync) {
      // Полная синхронизация - заменяем весь кеш
      console.log('Full sync detected, replacing entire cache');
      mergedEvents = newEvents;
      hasChanges = this.compareEvents(cachedEvents, newEvents);
    } else {
      // Инкрементальное обновление - объединяем с кешем
      console.log('Incremental update detected, merging with cache');
      mergedEvents = this.mergeEventsIntelligently(cachedEvents, newEvents);
      hasChanges = true; // Если пришли события при инкрементальном обновлении, значит есть изменения
    }

    if (hasChanges || mergedEvents.length !== cachedEvents.length) {
      // Сохраняем объединенные события в кеш
      this.setCachedEvents(mergedEvents, newEventsResponse.etag);
      console.log(`Events cache updated: ${mergedEvents.length} events (was ${cachedEvents.length})`);
      return {
        updatedEvents: mergedEvents, // Возвращаем ВСЕ события (кеш + новые)
        hasChanges: true
      };
    } else {
      console.log('No changes detected, keeping cached events');
      // Обновляем timestamp для продления валидности кеша
      const updatedCacheData = {
        ...cachedData,
        timestamp: Date.now(),
        etag: newEventsResponse.etag || cachedData.etag
      };
      localStorage.setItem(EventCacheService.CACHE_KEY, JSON.stringify(updatedCacheData));

      return {
        updatedEvents: cachedData.events,
        hasChanges: false
      };
    }
  }

  // Умное слияние событий: добавляем/обновляем/удаляем события в кеше
  private mergeEventsIntelligently(cachedEvents: CalendarEvent[], newEvents: CalendarEvent[]): CalendarEvent[] {
    console.log(`Merging events: ${cachedEvents.length} cached + ${newEvents.length} new`);

    // Создаем Map из кешированных событий для быстрого поиска
    const cachedEventsMap = new Map(cachedEvents.map(event => [event.id, event]));

    // Обрабатываем новые события
    for (const newEvent of newEvents) {
      if (newEvent.status === 'cancelled') {
        // Событие удалено - убираем из кеша
        console.log(`Removing cancelled event: ${newEvent.summary || newEvent.id}`);
        cachedEventsMap.delete(newEvent.id);
      } else {
        // Событие добавлено или обновлено
        const existingEvent = cachedEventsMap.get(newEvent.id);
        if (existingEvent) {
          console.log(`Updating existing event: ${newEvent.summary || newEvent.id}`);
        } else {
          console.log(`Adding new event: ${newEvent.summary || newEvent.id}`);
        }
        cachedEventsMap.set(newEvent.id, newEvent);
      }
    }

    // Возвращаем массив всех событий
    const mergedEvents = Array.from(cachedEventsMap.values());
    console.log(`Merge result: ${mergedEvents.length} total events`);

    return mergedEvents;
  }

  // Сравнить два массива событий
  compareEvents(oldEvents: CalendarEvent[], newEvents: CalendarEvent[]): boolean {
    if (oldEvents.length !== newEvents.length) {
      return true;
    }

    // Создаем мапы для быстрого поиска
    const oldEventsMap = new Map(oldEvents.map(event => [event.id, event]));

    for (const newEvent of newEvents) {
      const oldEvent = oldEventsMap.get(newEvent.id);

      if (!oldEvent) {
        // Новое событие
        return true;
      }

      // Сравниваем время обновления
      if (new Date(newEvent.updated) > new Date(oldEvent.updated)) {
        return true;
      }

      // Дополнительно можно сравнить ключевые поля
      if (newEvent.summary !== oldEvent.summary ||
          newEvent.start.dateTime !== oldEvent.start.dateTime ||
          newEvent.end.dateTime !== oldEvent.end.dateTime ||
          newEvent.status !== oldEvent.status) {
        return true;
      }
    }

    return false;
  }

  // Сравнить два массива событий (приватный метод для внутреннего использования)
  private compareEventsInternal(oldEvents: CalendarEvent[], newEvents: CalendarEvent[]): boolean {
    return this.compareEvents(oldEvents, newEvents);
  }

  // Очистить кеш
  clearCache(): void {
    localStorage.removeItem(EventCacheService.CACHE_KEY);
    console.log('Events cache cleared');
  }

  // Получить информацию о кеше для отладки
  getCacheInfo(): { hasCache: boolean; isValid: boolean; count: number; age: number } {
    const cached = this.getCachedEvents();
    if (!cached) {
      return { hasCache: false, isValid: false, count: 0, age: 0 };
    }

    const now = Date.now();
    const age = now - cached.timestamp;
    const isValid = age < EventCacheService.CACHE_DURATION;

    return {
      hasCache: true,
      isValid,
      count: cached.events.length,
      age: Math.round(age / 1000) // в секундах
    };
  }
}

export const eventCacheService = new EventCacheService();
