// Сервис для кеширования ответов ИИ
export interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class CacheService {
  private readonly CACHE_PREFIX = 'ai_cache_';
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

  /**
   * Генерирует ключ кеша на основе данных запроса
   */
  private generateCacheKey(data: any): string {
    // Создаем стабильный хеш из данных запроса
    const sortedData = this.sortObjectKeys(data);
    const jsonString = JSON.stringify(sortedData);
    return this.CACHE_PREFIX + this.simpleHash(jsonString);
  }

  /**
   * Простая хеш-функция для создания ключа кеша
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Преобразуем в 32-битное число
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Рекурсивно сортирует ключи объекта для стабильного хеширования
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: any = {};
    
    for (const key of sortedKeys) {
      sortedObj[key] = this.sortObjectKeys(obj[key]);
    }

    return sortedObj;
  }

  /**
   * Сохраняет данные в кеш
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    try {
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl
      };

      localStorage.setItem(key, JSON.stringify(cacheItem));
      console.log(`✅ Cached data with key: ${key}`);
    } catch (error) {
      console.warn('Failed to save to cache:', error);
    }
  }

  /**
   * Получает данные из кеша
   */
  get<T>(key: string): T | null {
    try {
      const cachedItem = localStorage.getItem(key);
      if (!cachedItem) {
        return null;
      }

      const cacheItem: CacheItem<T> = JSON.parse(cachedItem);
      
      // Проверяем, не истек ли срок действия кеша
      if (Date.now() > cacheItem.expiresAt) {
        console.log(`⏰ Cache expired for key: ${key}`);
        this.delete(key);
        return null;
      }

      console.log(`🎯 Cache hit for key: ${key}`);
      return cacheItem.data;
    } catch (error) {
      console.warn('Failed to read from cache:', error);
      return null;
    }
  }

  /**
   * Удаляет элемент из кеша
   */
  delete(key: string): void {
    try {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed from cache: ${key}`);
    } catch (error) {
      console.warn('Failed to delete from cache:', error);
    }
  }

  /**
   * Сохраняет данные в кеш с автоматической генерацией ключа
   */
  setByData<T>(requestData: any, responseData: T, ttl: number = this.DEFAULT_TTL): string {
    const cacheKey = this.generateCacheKey(requestData);
    this.set(cacheKey, responseData, ttl);
    return cacheKey;
  }

  /**
   * Получает данные из кеша по данным запроса
   */
  getByData<T>(requestData: any): T | null {
    const cacheKey = this.generateCacheKey(requestData);
    return this.get<T>(cacheKey);
  }

  /**
   * Очищает весь кеш ИИ
   */
  clearAICache(): void {
    try {
      const keys = Object.keys(localStorage);
      const aiCacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      
      for (const key of aiCacheKeys) {
        localStorage.removeItem(key);
      }
      
      console.log(`🧹 Cleared ${aiCacheKeys.length} AI cache entries`);
    } catch (error) {
      console.warn('Failed to clear AI cache:', error);
    }
  }

  /**
   * Получает информацию о кеше
   */
  getCacheInfo(): { totalEntries: number; totalSize: number; entries: Array<{key: string; size: number; expiresAt: number}> } {
    const keys = Object.keys(localStorage);
    const aiCacheKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
    
    let totalSize = 0;
    const entries = [];

    for (const key of aiCacheKeys) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const size = new Blob([value]).size;
          totalSize += size;

          const cacheItem = JSON.parse(value);
          entries.push({
            key,
            size,
            expiresAt: cacheItem.expiresAt
          });
        }
      } catch (error) {
        // Игнорируем поврежденные записи
      }
    }

    return {
      totalEntries: aiCacheKeys.length,
      totalSize,
      entries
    };
  }
}

const cacheService = new CacheService();
export default cacheService;
