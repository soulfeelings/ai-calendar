// Сервис кеширования рекомендаций с разными TTL для разных типов анализа
import { CalendarAnalysis } from './aiService';

export interface RecommendationsCacheItem {
  data: CalendarAnalysis;
  timestamp: number;
  expiresAt: number;
  analysisType: 'week' | 'tomorrow' | 'general';
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
      date_key: this.getDateKey(analysisType)
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
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        return startOfWeek.toISOString().split('T')[0];
      case 'general':
      default:
        // Для общего - ключ текущего дня
        return now.toISOString().split('T')[0];
    }
  }

  /**
   * Простая хеш-функция
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Получает TTL для типа анализа
   */
  private getTTL(analysisType: 'week' | 'tomorrow' | 'general'): number {
    return this.TTL_CONFIG[analysisType] || this.TTL_CONFIG.general;
  }

  /**
   * Сохраняет рекомендации в кеш
   */
  setRecommendations(
    requestData: any, 
    analysisData: CalendarAnalysis, 
    analysisType: 'week' | 'tomorrow' | 'general'
  ): void {
    try {
      const ttl = this.getTTL(analysisType);
      const cacheKey = this.generateCacheKey(requestData, analysisType);
      
      const cacheItem: RecommendationsCacheItem = {
        data: analysisData,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl,
        analysisType
      };

      localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      
      console.log(`✅ Cached ${analysisType} recommendations with key: ${cacheKey}`);
      console.log(`⏰ TTL: ${ttl / (60 * 60 * 1000)} hours`);
    } catch (error) {
      console.warn('Failed to cache recommendations:', error);
    }
  }

  /**
   * Получает рекомендации из кеша
   */
  getRecommendations(
    requestData: any, 
    analysisType: 'week' | 'tomorrow' | 'general'
  ): CalendarAnalysis | null {
    try {
      const cacheKey = this.generateCacheKey(requestData, analysisType);
      const cachedItem = localStorage.getItem(cacheKey);
      
      if (!cachedItem) {
        console.log(`❌ Cache miss for ${analysisType} recommendations`);
        return null;
      }

      const cacheItem: RecommendationsCacheItem = JSON.parse(cachedItem);
      
      // Проверяем срок действия
      if (Date.now() > cacheItem.expiresAt) {
        console.log(`⏰ Cache expired for ${analysisType} recommendations`);
        this.deleteRecommendations(requestData, analysisType);
        return null;
      }

      // Проверяем соответствие типа анализа
      if (cacheItem.analysisType !== analysisType) {
        console.log(`🔄 Analysis type mismatch, removing cache`);
        this.deleteRecommendations(requestData, analysisType);
        return null;
      }

      console.log(`🎯 Cache hit for ${analysisType} recommendations`);
      const ageInMinutes = Math.round((Date.now() - cacheItem.timestamp) / (60 * 1000));
      console.log(`📅 Cache age: ${ageInMinutes} minutes`);
      
      return cacheItem.data;
    } catch (error) {
      console.warn('Failed to read recommendations cache:', error);
      return null;
    }
  }

  /**
   * Удаляет рекомендации из кеша
   */
  deleteRecommendations(
    requestData: any, 
    analysisType: 'week' | 'tomorrow' | 'general'
  ): void {
    try {
      const cacheKey = this.generateCacheKey(requestData, analysisType);
      localStorage.removeItem(cacheKey);
      console.log(`🗑️ Removed ${analysisType} recommendations from cache`);
    } catch (error) {
      console.warn('Failed to delete recommendations cache:', error);
    }
  }

  /**
   * Очищает все кешированные рекомендации
   */
  clearAllRecommendations(): void {
    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      
      for (const key of recommendationKeys) {
        localStorage.removeItem(key);
      }
      
      console.log(`🧹 Cleared ${recommendationKeys.length} recommendation cache entries`);
    } catch (error) {
      console.warn('Failed to clear recommendations cache:', error);
    }
  }

  /**
   * Очищает кеш для определенного типа анализа
   */
  clearByType(analysisType: 'week' | 'tomorrow' | 'general'): void {
    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      let clearedCount = 0;
      
      for (const key of recommendationKeys) {
        try {
          const cachedItem = localStorage.getItem(key);
          if (cachedItem) {
            const cacheItem: RecommendationsCacheItem = JSON.parse(cachedItem);
            if (cacheItem.analysisType === analysisType) {
              localStorage.removeItem(key);
              clearedCount++;
            }
          }
        } catch (error) {
          // Если не удается распарсить, удаляем битый кеш
          localStorage.removeItem(key);
        }
      }
      
      console.log(`🧹 Cleared ${clearedCount} ${analysisType} recommendation cache entries`);
    } catch (error) {
      console.warn(`Failed to clear ${analysisType} recommendations cache:`, error);
    }
  }

  /**
   * Получает информацию о кеше рекомендаций
   */
  getCacheInfo(): {
    total: number;
    byType: Record<string, number>;
    entries: Array<{
      type: string;
      age: number;
      expiresIn: number;
    }>;
  } {
    const info = {
      total: 0,
      byType: { week: 0, tomorrow: 0, general: 0 },
      entries: [] as Array<{ type: string; age: number; expiresIn: number; }>
    };

    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(key => key.startsWith(this.CACHE_PREFIX));
      
      for (const key of recommendationKeys) {
        try {
          const cachedItem = localStorage.getItem(key);
          if (cachedItem) {
            const cacheItem: RecommendationsCacheItem = JSON.parse(cachedItem);
            const now = Date.now();
            
            if (now <= cacheItem.expiresAt) {
              info.total++;
              info.byType[cacheItem.analysisType]++;
              info.entries.push({
                type: cacheItem.analysisType,
                age: Math.round((now - cacheItem.timestamp) / (60 * 1000)),
                expiresIn: Math.round((cacheItem.expiresAt - now) / (60 * 1000))
              });
            } else {
              // Удаляем просроченный кеш
              localStorage.removeItem(key);
            }
          }
        } catch (error) {
          // Удаляем битый кеш
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Failed to get cache info:', error);
    }

    return info;
  }
}

// Создаем единственный экземпляр сервиса
const recommendationsCacheService = new RecommendationsCacheService();
export default recommendationsCacheService;
