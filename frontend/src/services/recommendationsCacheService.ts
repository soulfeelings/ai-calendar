// Сервис кеширования рекомендаций ИИ с разными TTL для разных типов анализа
import { CalendarAnalysis } from './aiService';

export interface RecommendationsCacheItem {
  data: CalendarAnalysis;
  timestamp: number;
  expiresAt: number;
  analysisType: 'week' | 'tomorrow' | 'general';
  requestHash: string;
}

class RecommendationsCacheService {
  private readonly CACHE_PREFIX = 'ai_recommendations_';

  // TTL для разных типов анализа
  private readonly TTL_CONFIG = {
    tomorrow: 24 * 60 * 60 * 1000,      // 24 часа для "завтра"
    general: 24 * 60 * 60 * 1000,       // 24 часа для общего анализа
    week: 7 * 24 * 60 * 60 * 1000,      // 7 дней для недельного анализа
  };

  /**
   * Генерирует ключ кеша на основе данных запроса и типа анализа
   */
  private generateCacheKey(requestData: any, analysisType: string): string {
    // Создаем уникальный ключ включающий тип анализа
    const keyData = {
      type: analysisType,
      events_count: requestData.calendar_events?.length || 0,
      goals_count: requestData.user_goals?.length || 0,
      analysis_period_days: requestData.analysis_period_days,
      // Добавляем дату для лучшей инвалидации кеша
      date_key: this.getDateKey(analysisType),
      // Хеш целей для инвалидации при изменении
      goals_hash: this.hashGoals(requestData.user_goals || [])
    };

    const jsonString = JSON.stringify(keyData);
    return this.CACHE_PREFIX + this.simpleHash(jsonString);
  }

  /**
   * Получает ключ даты для разных типов анализа
   */
  private getDateKey(analysisType: string): string {
    const now = new Date();

    switch (analysisType) {
      case 'tomorrow':
        // Для завтра - ключ текущего дня
        return now.toISOString().split('T')[0];
      case 'week':
        // Для недели - ключ начала недели
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Понедельник
        return startOfWeek.toISOString().split('T')[0];
      default:
        return now.toISOString().split('T')[0];
    }
  }

  /**
   * Создает хеш целей для отслеживания изменений
   */
  private hashGoals(goals: any[]): string {
    const goalsSummary = goals.map(goal => ({
      id: goal.id,
      title: goal.title,
      deadline: goal.deadline,
      priority: goal.priority
    }));
    return this.simpleHash(JSON.stringify(goalsSummary));
  }

  /**
   * Простая хеш-функция для создания уникальных ключей
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Получает TTL для указанного типа анализа
   */
  private getTTL(analysisType: string): number {
    return this.TTL_CONFIG[analysisType as keyof typeof this.TTL_CONFIG] || this.TTL_CONFIG.general;
  }

  /**
   * Сохраняет результат анализа в кеш
   */
  setRecommendations(requestData: any, analysisType: string, result: CalendarAnalysis): void {
    try {
      const cacheKey = this.generateCacheKey(requestData, analysisType);
      const ttl = this.getTTL(analysisType);
      const timestamp = Date.now();
      const expiresAt = timestamp + ttl;

      const cacheItem: RecommendationsCacheItem = {
        data: result,
        timestamp,
        expiresAt,
        analysisType: analysisType as 'week' | 'tomorrow' | 'general',
        requestHash: this.simpleHash(JSON.stringify(requestData))
      };

      localStorage.setItem(cacheKey, JSON.stringify(cacheItem));

      console.log(`💾 Cached AI recommendations for ${analysisType} (TTL: ${ttl}ms)`, {
        key: cacheKey,
        expiresAt: new Date(expiresAt).toISOString()
      });
    } catch (error) {
      console.warn('Failed to cache AI recommendations:', error);
    }
  }

  /**
   * Получает кешированный результат анализа
   */
  getRecommendations(requestData: any, analysisType: string): CalendarAnalysis | null {
    try {
      const cacheKey = this.generateCacheKey(requestData, analysisType);
      const cachedData = localStorage.getItem(cacheKey);

      if (!cachedData) {
        console.log(`📭 No cached recommendations found for ${analysisType}`);
        return null;
      }

      const cacheItem: RecommendationsCacheItem = JSON.parse(cachedData);
      const now = Date.now();

      // Проверяем, не истек ли кеш
      if (now > cacheItem.expiresAt) {
        console.log(`⏰ Cache expired for ${analysisType}, removing...`);
        localStorage.removeItem(cacheKey);
        return null;
      }

      // Проверяем, не изменились ли данные запроса
      const currentRequestHash = this.simpleHash(JSON.stringify(requestData));
      if (cacheItem.requestHash !== currentRequestHash) {
        console.log(`🔄 Request data changed for ${analysisType}, cache invalidated`);
        localStorage.removeItem(cacheKey);
        return null;
      }

      const timeLeft = cacheItem.expiresAt - now;
      console.log(`📦 Using cached recommendations for ${analysisType}`, {
        cached_at: new Date(cacheItem.timestamp).toISOString(),
        expires_in: `${Math.round(timeLeft / (1000 * 60))} minutes`
      });

      return cacheItem.data;
    } catch (error) {
      console.warn('Failed to retrieve cached recommendations:', error);
      return null;
    }
  }

  /**
   * Проверяет, есть ли валидный кеш для указанного типа анализа
   */
  hasValidCache(requestData: any, analysisType: string): boolean {
    return this.getRecommendations(requestData, analysisType) !== null;
  }

  /**
   * Очищает кеш для конкретного типа анализа
   */
  clearRecommendations(analysisType?: string): void {
    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));

      if (analysisType) {
        // Очищаем кеш только для указанного типа
        recommendationKeys.forEach(key => {
          const cachedData = localStorage.getItem(key);
          if (cachedData) {
            try {
              const cacheItem: RecommendationsCacheItem = JSON.parse(cachedData);
              if (cacheItem.analysisType === analysisType) {
                localStorage.removeItem(key);
                console.log(`🗑️ Cleared ${analysisType} cache`);
              }
            } catch (e) {
              // Удаляем поврежденные записи
              localStorage.removeItem(key);
            }
          }
        });
      } else {
        // Очищаем весь кеш рекомендаций
        recommendationKeys.forEach(key => localStorage.removeItem(key));
        console.log('🧹 Cleared all AI recommendations cache');
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  /**
   * Очищает весь кеш рекомендаций
   */
  clearAllRecommendations(): void {
    this.clearRecommendations();
  }

  /**
   * Очищает просроченный кеш
   */
  cleanupExpiredCache(): void {
    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      const now = Date.now();
      let cleanedCount = 0;

      recommendationKeys.forEach(key => {
        const cachedData = localStorage.getItem(key);
        if (cachedData) {
          try {
            const cacheItem: RecommendationsCacheItem = JSON.parse(cachedData);
            if (now > cacheItem.expiresAt) {
              localStorage.removeItem(key);
              cleanedCount++;
            }
          } catch (e) {
            // Удаляем поврежденные записи
            localStorage.removeItem(key);
            cleanedCount++;
          }
        }
      });

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
      }
    } catch (error) {
      console.warn('Failed to cleanup expired cache:', error);
    }
  }

  /**
   * Получает информацию о состоянии кеша
   */
  getCacheInfo(): {
    total: number;
    expired: number;
    byType: Record<string, number>;
    totalSize: number;
  } {
    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      const now = Date.now();

      let totalSize = 0;
      let expiredCount = 0;
      const byType: Record<string, number> = {
        tomorrow: 0,
        week: 0,
        general: 0
      };

      recommendationKeys.forEach(key => {
        const cachedData = localStorage.getItem(key);
        if (cachedData) {
          totalSize += cachedData.length;
          try {
            const cacheItem: RecommendationsCacheItem = JSON.parse(cachedData);
            if (now > cacheItem.expiresAt) {
              expiredCount++;
            }
            byType[cacheItem.analysisType] = (byType[cacheItem.analysisType] || 0) + 1;
          } catch (e) {
            expiredCount++;
          }
        }
      });

      return {
        total: recommendationKeys.length,
        expired: expiredCount,
        byType,
        totalSize
      };
    } catch (error) {
      console.warn('Failed to get cache info:', error);
      return {
        total: 0,
        expired: 0,
        byType: { tomorrow: 0, week: 0, general: 0 },
        totalSize: 0
      };
    }
  }

  /**
   * Инициализирует сервис кеширования (очищает просроченные записи)
   */
  init(): void {
    this.cleanupExpiredCache();
    console.log('📦 RecommendationsCacheService initialized');
  }
}

// Создаем и экспортируем единственный экземпляр
const recommendationsCacheService = new RecommendationsCacheService();

// Инициализируем при первом импорте
recommendationsCacheService.init();

export default recommendationsCacheService;
