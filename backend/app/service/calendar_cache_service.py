import json
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from cache.accessor import AsyncRedisManager
import redis.asyncio as redis


class CalendarCacheService:
    """
    Сервис для кеширования календарных данных в Redis.
    TTL = 6 минут для всех записей.
    """

    def __init__(self, redis_manager: AsyncRedisManager):
        self.redis_manager = redis_manager
        self.ttl_seconds = 360  # 6 минут
        
        # Префиксы для разных типов данных
        self.PREFIX_EVENTS = "calendar:events:"
        self.PREFIX_EVENT = "calendar:event:"
        self.PREFIX_SYNC_TOKEN = "calendar:sync_token:"
        self.PREFIX_USER_CALENDARS = "calendar:user_calendars:"
        self.PREFIX_WEBHOOK_SUBS = "calendar:webhook_subs:"

    async def cache_user_events(self, user_id: str, events_data: Dict[str, Any]) -> bool:
        """
        Кеширует все события пользователя.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_EVENTS}{user_id}"

                # Сериализуем данные в JSON
                serialized_data = json.dumps(events_data, ensure_ascii=False)

                # Сохраняем с TTL 6 минут
                await client.setex(key, self.ttl_seconds, serialized_data)

                # Также кешируем отдельные события для быстрого доступа
                if "items" in events_data:
                    await self._cache_individual_events(client, user_id, events_data["items"])

                return True
        except Exception as e:
            print(f"Error caching user events: {str(e)}")
            return False

    async def get_user_events(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Получает события пользователя из кеша.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_EVENTS}{user_id}"
                cached_data = await client.get(key)

                if cached_data:
                    return json.loads(cached_data)
                return None
        except Exception as e:
            print(f"Error getting user events from cache: {str(e)}")
            return None

    async def cache_single_event(self, user_id: str, event_data: Dict[str, Any]) -> bool:
        """
        Кеширует отдельное событие.
        """
        try:
            async with self.redis_manager.get_client() as client:
                event_id = event_data.get("id")
                if not event_id:
                    return False

                # Кешируем отдельное событие
                event_key = f"{self.PREFIX_EVENT}{user_id}:{event_id}"
                serialized_event = json.dumps(event_data, ensure_ascii=False)
                await client.setex(event_key, self.ttl_seconds, serialized_event)

                return True
        except Exception as e:
            print(f"Error caching single event: {str(e)}")
            return False

    async def get_single_event(self, user_id: str, event_id: str) -> Optional[Dict[str, Any]]:
        """
        Получает отдельное событие из кеша.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_EVENT}{user_id}:{event_id}"
                cached_data = await client.get(key)

                if cached_data:
                    return json.loads(cached_data)
                return None
        except Exception as e:
            print(f"Error getting single event from cache: {str(e)}")
            return None

    async def update_event_in_cache(self, user_id: str, event_data: Dict[str, Any]) -> bool:
        """
        Обновляет событие в кеше (и в общем списке событий, если он есть).
        """
        try:
            async with self.redis_manager.get_client() as client:
                event_id = event_data.get("id")
                if not event_id:
                    return False

                # Обновляем отдельное событие
                await self.cache_single_event(user_id, event_data)

                # Обновляем событие в общем списке, если он закеширован
                events_key = f"{self.PREFIX_EVENTS}{user_id}"
                cached_events = await client.get(events_key)

                if cached_events:
                    events_data = json.loads(cached_events)
                    if "items" in events_data:
                        # Находим и обновляем событие в списке
                        for i, item in enumerate(events_data["items"]):
                            if item.get("id") == event_id:
                                events_data["items"][i] = event_data
                                break
                        else:
                            # Если события нет в списке, добавляем его
                            events_data["items"].append(event_data)

                        # Сохраняем обновленный список
                        updated_data = json.dumps(events_data, ensure_ascii=False)
                        await client.setex(events_key, self.ttl_seconds, updated_data)

                return True
        except Exception as e:
            print(f"Error updating event in cache: {str(e)}")
            return False

    async def remove_event_from_cache(self, user_id: str, event_id: str) -> bool:
        """
        Удаляет событие из кеша.
        """
        try:
            async with self.redis_manager.get_client() as client:
                # Удаляем отдельное событие
                event_key = f"{self.PREFIX_EVENT}{user_id}:{event_id}"
                await client.delete(event_key)

                # Удаляем событие из общего списка, если он закеширован
                events_key = f"{self.PREFIX_EVENTS}{user_id}"
                cached_events = await client.get(events_key)

                if cached_events:
                    events_data = json.loads(cached_events)
                    if "items" in events_data:
                        # Удаляем событие из списка
                        events_data["items"] = [
                            item for item in events_data["items"]
                            if item.get("id") != event_id
                        ]

                        # Сохраняем обновленный список
                        updated_data = json.dumps(events_data, ensure_ascii=False)
                        await client.setex(events_key, self.ttl_seconds, updated_data)

                return True
        except Exception as e:
            print(f"Error removing event from cache: {str(e)}")
            return False

    async def cache_sync_token(self, user_id: str, sync_token: str) -> bool:
        """
        Кеширует sync token пользователя.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_SYNC_TOKEN}{user_id}"
                await client.setex(key, self.ttl_seconds, sync_token)
                return True
        except Exception as e:
            print(f"Error caching sync token: {str(e)}")
            return False

    async def get_sync_token(self, user_id: str) -> Optional[str]:
        """
        Получает sync token из кеша.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_SYNC_TOKEN}{user_id}"
                return await client.get(key)
        except Exception as e:
            print(f"Error getting sync token from cache: {str(e)}")
            return None

    async def cache_user_calendar_list(self, user_id: str, calendar_data: Dict[str, Any]) -> bool:
        """
        Кеширует список календарей пользователя.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_USER_CALENDARS}{user_id}"
                serialized_data = json.dumps(calendar_data, ensure_ascii=False)
                await client.setex(key, self.ttl_seconds, serialized_data)
                return True
        except Exception as e:
            print(f"Error caching user calendar list: {str(e)}")
            return False

    async def get_user_calendar_list(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Получает список календарей пользователя из кеша.
        """
        try:
            async with self.redis_manager.get_client() as client:
                key = f"{self.PREFIX_USER_CALENDARS}{user_id}"
                cached_data = await client.get(key)

                if cached_data:
                    return json.loads(cached_data)
                return None
        except Exception as e:
            print(f"Error getting user calendar list from cache: {str(e)}")
            return None

    async def invalidate_user_cache(self, user_id: str) -> bool:
        """
        Инвалидирует весь кеш пользователя.
        """
        try:
            async with self.redis_manager.get_client() as client:
                # Получаем все ключи пользователя
                patterns = [
                    f"{self.PREFIX_EVENTS}{user_id}",
                    f"{self.PREFIX_EVENT}{user_id}:*",
                    f"{self.PREFIX_SYNC_TOKEN}{user_id}",
                    f"{self.PREFIX_USER_CALENDARS}{user_id}"
                ]

                for pattern in patterns:
                    if "*" in pattern:
                        keys = await client.keys(pattern)
                        if keys:
                            await client.delete(*keys)
                    else:
                        await client.delete(pattern)

                return True
        except Exception as e:
            print(f"Error invalidating user cache: {str(e)}")
            return False

    async def _cache_individual_events(self, client: redis.Redis, user_id: str, events: List[Dict[str, Any]]):
        """
        Внутренний метод для кеширования отдельных событий.
        """
        try:
            pipe = client.pipeline()

            for event in events:
                event_id = event.get("id")
                if event_id:
                    key = f"{self.PREFIX_EVENT}{user_id}:{event_id}"
                    serialized_event = json.dumps(event, ensure_ascii=False)
                    pipe.setex(key, self.ttl_seconds, serialized_event)

            await pipe.execute()
        except Exception as e:
            print(f"Error caching individual events: {str(e)}")

    async def get_cache_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Получает статистику кеша для пользователя.
        """
        try:
            async with self.redis_manager.get_client() as client:
                stats = {
                    "user_events_cached": False,
                    "sync_token_cached": False,
                    "calendar_list_cached": False,
                    "individual_events_count": 0,
                    "cache_ttl_remaining": {}
                }

                # Проверяем основные ключи
                events_key = f"{self.PREFIX_EVENTS}{user_id}"
                sync_token_key = f"{self.PREFIX_SYNC_TOKEN}{user_id}"
                calendars_key = f"{self.PREFIX_USER_CALENDARS}{user_id}"

                stats["user_events_cached"] = await client.exists(events_key)
                stats["sync_token_cached"] = await client.exists(sync_token_key)
                stats["calendar_list_cached"] = await client.exists(calendars_key)

                # Подсчитываем отдельные события
                event_keys = await client.keys(f"{self.PREFIX_EVENT}{user_id}:*")
                stats["individual_events_count"] = len(event_keys)

                # Получаем TTL для основных ключей
                if stats["user_events_cached"]:
                    stats["cache_ttl_remaining"]["events"] = await client.ttl(events_key)
                if stats["sync_token_cached"]:
                    stats["cache_ttl_remaining"]["sync_token"] = await client.ttl(sync_token_key)
                if stats["calendar_list_cached"]:
                    stats["cache_ttl_remaining"]["calendars"] = await client.ttl(calendars_key)

                return stats
        except Exception as e:
            print(f"Error getting cache stats: {str(e)}")
            return {}
