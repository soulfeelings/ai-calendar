import urllib.parse
from dataclasses import dataclass
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status
from repository.calendar_repo import CalendarRepo
from service.calendar_cache_service import CalendarCacheService
import aiohttp
from fastapi.responses import RedirectResponse
from settings import settings

@dataclass
class CalendarService:
    calendar_repo: CalendarRepo
    cache_service: CalendarCacheService
    google_token_url: str = "https://oauth2.googleapis.com/token"
    calendat_list: str = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
    all_event: str = "https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events" #TODO: syncTOKEN
    specific_event: str = all_event+"/{eventId}"
    watch_url: str = "https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/watch"
    stop_watch_url: str = "https://www.googleapis.com/calendar/v3/channels/stop"


    async def get_calendar_list(self, user_id):
        try:
            # Сначала проверяем кеш
            cached_calendar_list = await self.cache_service.get_user_calendar_list(user_id)
            if cached_calendar_list:
                return cached_calendar_list

            user_scope = await self.calendar_repo.get_user_scope(user_id)

            if "https://www.googleapis.com/auth/calendar" not in user_scope[0].split():
                query_params = {
                    "client_id": settings.CLIENT_ID,
                    "redirect_uri": "http://localhost:8000/",
                    "response_type": "code",
                    "scope": " ".join([
                        "https://www.googleapis.com/auth/calendar",
                    ]),
                    "access_type": "offline",
                    "login_hint": user_scope[1],
                    # TODO: "state": ,
                }

                query_string = urllib.parse.urlencode(query_params, quote_via=urllib.parse.quote)
                base_url = "https://accounts.google.com/o/oauth2/v2/auth"
                return RedirectResponse(url=f'{base_url}?{query_string}', status_code=status.HTTP_302_FOUND)

            user_access = await self.calendar_repo.get_access_token(user_id)

            async with aiohttp.ClientSession() as session:
                async with session.get(
                        url=self.calendat_list,
                        headers={
                        "Authorization": f"Bearer {user_access}"
                        }
                ) as response:
                    res =  await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=response.status, detail=res)

                    # Сохраняем в БД и кеш
                    await self.calendar_repo.update_user_calendar_list(user_id, res)
                    await self.cache_service.cache_user_calendar_list(user_id, res)

                    return res

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def update_user_scope(self, user_id, code):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                        url=self.google_token_url,
                        data={
                            "client_id": settings.CLIENT_ID,
                            "client_secret": settings.CLIENT_SECRET,
                            "grant_type": "authorization_code",
                            "redirect_uri": "http://localhost:8000/",
                            "code": code,
                        }
                ) as response:
                    res = await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res)


                    user_sub = await self.calendar_repo.get_user_scope(user_id)

                    await self.calendar_repo.update_user_scope(
                        user_id,
                        scope=f"{user_sub[0]} {res["scope"]}",
                        access_token=res["access_token"],
                        refresh_token=res["refresh_token"],
                    )


        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def get_all_user_calendar_events(self, user_id, forceFullSync, fullResponse):
        try:
            # Если не принудительная синхронизация, проверяем кеш
            if not forceFullSync:
                cached_events = await self.cache_service.get_user_events(user_id)
                if cached_events and fullResponse:
                    return cached_events

            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            
            # Проверяем sync token в кеше, если не найден - в БД
            token = await self.cache_service.get_sync_token(user_id)
            if not token:
                token = await self.calendar_repo.get_synctoken_if_exists(user_id=user_id)
            
            if forceFullSync:
                token = None

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url=f"{self.all_event.format(calendarId=email_and_access[0])}{"?syncToken="+token if token else ""}",
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}"
                    }
                ) as response:
                    res = await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=response.status, detail=res)

                    if response.status == 410:
                         return await self.get_all_user_calendar_events(user_id, True, fullResponse)

                    # Сохраняем sync token в БД и кеш
                    await self.calendar_repo.update_synctoken(user_id, res["nextSyncToken"])
                    await self.cache_service.cache_sync_token(user_id, res["nextSyncToken"])

                    if not token:
                        # Полная синхронизация - сохраняем все события
                        await self.calendar_repo.insert_events(user_id=user_id, data=res)
                        await self.cache_service.cache_user_events(user_id, res)

                    if res.get("items") and token:
                        # Инкрементальная синхронизация - обновляем изменившиеся события
                        await self.calendar_repo.update_items(user_id=user_id, items=res["items"])
                        
                        # Обновляем события в кеше
                        for item in res["items"]:
                            if item.get("status") == "cancelled":
                                # Удаляем отмененные события из кеша
                                await self.cache_service.remove_event_from_cache(user_id, item["id"])
                            else:
                                # Обновляем измененные события в кеше
                                await self.cache_service.update_event_in_cache(user_id, item)

                    if fullResponse:
                        if not token:
                            # При полной синхронизации возвращаем закешированные данные
                            return res
                        else:
                            # При инкрементальной - получаем обновленные данные из БД
                            db_events = await self.calendar_repo.get_all_event(user_id=user_id)
                            # Обновляем кеш с полными данными
                            await self.cache_service.cache_user_events(user_id, db_events)
                            return db_events

                    return res

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def get_event_from_id(self, user_id, event_id):
        try:
            # Сначала проверяем кеш
            cached_event = await self.cache_service.get_single_event(user_id, event_id)
            if cached_event:
                return dict({"status": "from_cache"}, **cached_event)

            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            etag = await self.calendar_repo.get_etag_from_id(user_id, event_id)

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url=f"{self.specific_event.format(calendarId=email_and_access[0],eventId=event_id)}",
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}",
                        "If-None-Match": etag[0] if etag else None
                    }
                ) as response:

                    if response.status == 304:
                        # Событие не изменилось, возвращаем из БД
                        event_data = await self.calendar_repo.get_event_from_id(user_id, event_id)
                        # Кешируем событие
                        await self.cache_service.cache_single_event(user_id, event_data)
                        return dict({"status": "not changed"}, **event_data)

                    res = await response.json()

                    if response.status == 401:
                        raise HTTPException(status_code=response.status, detail=res)

                    elif response.status == 200:
                        # Обновляем в БД и кеше
                        await self.calendar_repo.update_item(user_id=user_id, data=res)
                        await self.cache_service.update_event_in_cache(user_id, res)

                    return dict({"status": "updated"}, **res)

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def setup_calendar_webhook(self, user_id: str):
        """
        Настройка подписки на вебхуки для календаря пользователя.
        """
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id)

            # Генерируем уникальный channel_id
            channel_id = str(uuid.uuid4())

            # Время жизни подписки (максимум 7 дней для Google Calendar)
            expiration = int((datetime.now() + timedelta(days=6)).timestamp() * 1000)

            webhook_payload = {
                "id": channel_id,
                "type": "web_hook",
                "address": f"{settings.WEBHOOK_BASE_URL}/webhook/google-calendar",
                "expiration": expiration
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url=self.watch_url.format(calendarId=email_and_access[0]),
                    json=webhook_payload,
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}",
                        "Content-Type": "application/json"
                    }
                ) as response:
                    if response.status != 200:
                        res = await response.json()
                        raise HTTPException(status_code=response.status, detail=res)

                    res = await response.json()

                    # Сохраняем информацию о подписке в БД
                    await self.calendar_repo.save_webhook_subscription(
                        user_id=user_id,
                        channel_id=channel_id,
                        resource_id=res.get("resourceId"),
                        expiration=expiration
                    )

                    return {
                        "channel_id": channel_id,
                        "resource_id": res.get("resourceId"),
                        "expiration": expiration
                    }

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def handle_calendar_change_notification(self, user_id: str, channel_id: str, resource_id: str, resource_uri: str):
        """
        Обрабатывает уведомление об изменениях в календаре.
        Выполняет incremental sync с использованием syncToken.
        """
        try:
            # Получаем события с последнего syncToken
            await self.get_all_user_calendar_events(user_id, forceFullSync=False, fullResponse=False)

            # Обновляем timestamp последнего обновления
            await self.calendar_repo.update_webhook_last_sync(channel_id)

        except Exception as e:
            # Логируем ошибку, но не пробрасываем, чтобы не нарушить работу вебхука
            print(f"Error handling calendar change notification: {str(e)}")

    async def unsubscribe_calendar_webhook(self, channel_id: str):
        """
        Отписка от вебхука по channel_id.
        """
        try:
            # Получаем информацию о подписке
            subscription = await self.calendar_repo.get_webhook_subscription(channel_id)
            if not subscription:
                raise ValueError("Subscription not found")

            user_id = subscription["user_id"]
            resource_id = subscription["resource_id"]

            email_and_access = await self.calendar_repo.get_access_and_email(user_id)

            # Отправляем запрос на отписку в Google
            stop_payload = {
                "id": channel_id,
                "resourceId": resource_id
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url=self.stop_watch_url,
                    json=stop_payload,
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}",
                        "Content-Type": "application/json"
                    }
                ) as response:
                    if response.status not in [200, 204]:
                        res = await response.json()
                        raise HTTPException(status_code=response.status, detail=res)

            # Удаляем подписку из БД
            await self.calendar_repo.delete_webhook_subscription(channel_id)

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def get_user_by_channel_id(self, channel_id: str):
        """
        Получает user_id по channel_id.
        """
        subscription = await self.calendar_repo.get_webhook_subscription(channel_id)
        return subscription["user_id"] if subscription else None

    async def get_webhook_status(self, user_id: str):
        """
        Получение статуса подписки на вебхуки для пользователя.
        """
        subscriptions = await self.calendar_repo.get_user_webhook_subscriptions(user_id)

        active_subscriptions = []
        for sub in subscriptions:
            # Проверяем, не истекла ли подписка
            if sub["expiration"] > int(datetime.now().timestamp() * 1000):
                active_subscriptions.append({
                    "channel_id": sub["channel_id"],
                    "expiration": sub["expiration"],
                    "last_sync": sub.get("last_sync")
                })

        return {
            "active_subscriptions": active_subscriptions,
            "total_active": len(active_subscriptions)
        }

    async def refresh_webhook_if_needed(self, user_id: str):
        """
        Проверяет и обновляет подписки на вебхуки, если они скоро истекут.
        """
        subscriptions = await self.calendar_repo.get_user_webhook_subscriptions(user_id)

        current_time = datetime.now().timestamp() * 1000
        refresh_threshold = 24 * 60 * 60 * 1000  # 24 часа в миллисекундах

        for subscription in subscriptions:
            if subscription["expiration"] - current_time < refresh_threshold:
                # Отписываемся от старого вебхука
                try:
                    await self.unsubscribe_calendar_webhook(subscription["channel_id"])
                except:
                    pass  # Игнорируем ошибки при отписке

                # Создаем новую подписку
                await self.setup_calendar_webhook(user_id)

    async def update_event_from_webhook(self, user_id: str, event_id: str):
        """
        Обновляет конкретное событие по ID с использованием etag.
        Вызывается при получении вебхука об изменении события.
        """
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id)
            etag = await self.calendar_repo.get_etag_from_id(user_id, event_id)

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url=f"{self.specific_event.format(calendarId=email_and_access[0], eventId=event_id)}",
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}",
                        "If-None-Match": etag[0] if etag else None
                    }
                ) as response:

                    if response.status == 304:
                        # Событие не изменилось
                        event_data = await self.calendar_repo.get_event_from_id(user_id, event_id)
                        return {
                            "status": "not_changed",
                            "message": "Event has not been modified",
                            "event": event_data
                        }

                    if response.status == 404:
                        # Событие было удалено - удаляем из БД и кеша
                        await self.calendar_repo.remove_event_from_cache(user_id, event_id)
                        await self.cache_service.remove_event_from_cache(user_id, event_id)
                        return {
                            "status": "deleted",
                            "message": "Event was deleted",
                            "event_id": event_id
                        }

                    if response.status == 401:
                        # Токен доступа истек, нужно обновить
                        await self._refresh_access_token(user_id)
                        # Повторяем запрос с новым токеном
                        return await self.update_event_from_webhook(user_id, event_id)

                    if response.status == 200:
                        res = await response.json()
                        # Обновляем событие в БД и кеше
                        await self.calendar_repo.update_item(user_id=user_id, data=res)
                        await self.cache_service.update_event_in_cache(user_id, res)
                        return {
                            "status": "updated",
                            "message": "Event updated successfully",
                            "event": res
                        }

                    # Обрабатываем другие статусы ошибок
                    res = await response.json()
                    raise HTTPException(status_code=response.status, detail=res)

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def _refresh_access_token(self, user_id: str):
        """
        Обновляет access token используя refresh token.
        """
        try:
            user_data = await self.calendar_repo.get_user_tokens(user_id)
            refresh_token = user_data.get("refresh_token")

            if not refresh_token:
                raise ValueError("No refresh token available")

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url=self.google_token_url,
                    data={
                        "client_id": settings.CLIENT_ID,
                        "client_secret": settings.CLIENT_SECRET,
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                    }
                ) as response:
                    if response.status != 200:
                        res = await response.json()
                        raise HTTPException(status_code=response.status, detail=res)

                    res = await response.json()

                    # Обновляем access token в БД
                    await self.calendar_repo.update_access_token(
                        user_id=user_id,
                        access_token=res["access_token"]
                    )

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to refresh token: {str(e)}")
