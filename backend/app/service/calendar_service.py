import urllib.parse
from dataclasses import dataclass
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import aiohttp
from enum import Enum

from fastapi import HTTPException, status
from repository.calendar_repo import CalendarRepo
from service.calendar_cache_service import CalendarCacheService
from service.googleoauth import GoogleOauthService
from fastapi.responses import RedirectResponse
from settings import settings
from schemas.event_schemas import UpdateEventRequest, EventUpdateResponse

class HttpMethod(Enum):
    GET = "GET"
    POST = "POST"
    PATCH = "PATCH"
    DELETE = "DELETE"
    PUT = "PUT"

@dataclass
class CalendarService:
    calendar_repo: CalendarRepo
    cache_service: CalendarCacheService
    google_oauth_service: GoogleOauthService
    google_token_url: str = "https://oauth2.googleapis.com/token"
    calendat_list: str = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
    all_event: str = "https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events" #TODO: syncTOKEN
    specific_event: str = all_event+"/{eventId}"
    watch_url: str = "https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/watch"
    stop_watch_url: str = "https://www.googleapis.com/calendar/v3/channels/stop"

    async def _make_google_api_request(
        self,
        user_id: str,
        url: str,
        method: HttpMethod = HttpMethod.GET,
        headers: Optional[Dict[str, str]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        retry_count: int = 0
    ) -> Dict[str, Any]:
        """
        Универсальный метод для выполнения запросов к Google API с автоматической обработкой 401 ошибок.

        Args:
            user_id: ID пользователя
            url: URL для запроса
            method: HTTP метод
            headers: Дополнительные заголовки
            json_data: JSON данные для отправки
            data: Form данные для отправки
            retry_count: Счетчик повторов (для избежания бесконечной рекурсии)

        Returns:
            Dict[str, Any]: Ответ от Google API

        Raises:
            HTTPException: При ошибках API или превышении лимита повторов
        """
        try:
            # Получаем access token пользователя
            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            access_token = email_and_access[1]

            # Подготавливаем заголовки
            request_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            if headers:
                request_headers.update(headers)

            async with aiohttp.ClientSession() as session:
                # Выбираем правильный метод запроса
                if method == HttpMethod.GET:
                    async with session.get(url, headers=request_headers) as response:
                        return await self._handle_google_api_response(
                            response, user_id, url, method, headers, json_data, data, retry_count
                        )
                elif method == HttpMethod.POST:
                    async with session.post(url, headers=request_headers, json=json_data, data=data) as response:
                        return await self._handle_google_api_response(
                            response, user_id, url, method, headers, json_data, data, retry_count
                        )
                elif method == HttpMethod.PATCH:
                    async with session.patch(url, headers=request_headers, json=json_data) as response:
                        return await self._handle_google_api_response(
                            response, user_id, url, method, headers, json_data, data, retry_count
                        )
                elif method == HttpMethod.PUT:
                    async with session.put(url, headers=request_headers, json=json_data) as response:
                        return await self._handle_google_api_response(
                            response, user_id, url, method, headers, json_data, data, retry_count
                        )
                elif method == HttpMethod.DELETE:
                    async with session.delete(url, headers=request_headers) as response:
                        return await self._handle_google_api_response(
                            response, user_id, url, method, headers, json_data, data, retry_count
                        )

        except Exception as e:
            if "401" in str(e) or "unauthorized" in str(e).lower():
                # Если это 401 ошибка, попробуем обновить токен
                return await self._handle_401_error(
                    user_id, url, method, headers, json_data, data, retry_count
                )
            raise

    async def _handle_google_api_response(
        self,
        response: aiohttp.ClientResponse,
        user_id: str,
        url: str,
        method: HttpMethod,
        headers: Optional[Dict[str, str]],
        json_data: Optional[Dict[str, Any]],
        data: Optional[Dict[str, Any]],
        retry_count: int
    ) -> Dict[str, Any]:
        """Обрабатывает ответ от Google API"""

        if response.status == 401:
            # Access token истек - обновляем его
            return await self._handle_401_error(
                user_id, url, method, headers, json_data, data, retry_count
            )

        # Для статусов 204 (No Content) возвращаем пустой словарь
        if response.status == 204:
            return {"status": "success", "message": "Operation completed successfully"}

        # Для остальных статусов пытаемся получить JSON
        try:
            res = await response.json()
        except Exception:
            res = {"message": "No JSON response", "status_code": response.status}

        if response.status not in [200, 201, 204]:
            raise HTTPException(status_code=response.status, detail=res)

        return res

    async def _handle_401_error(
        self,
        user_id: str,
        url: str,
        method: HttpMethod,
        headers: Optional[Dict[str, str]],
        json_data: Optional[Dict[str, Any]],
        data: Optional[Dict[str, Any]],
        retry_count: int
    ) -> Dict[str, Any]:
        """Обрабатывает 401 ошибку с обновлением токена"""

        if retry_count >= 1:
            # Избегаем бесконечной рекурсии
            raise HTTPException(
                status_code=401,
                detail="Authentication failed after token refresh attempt"
            )

        # Обновляем access token через GoogleOauthService
        await self.google_oauth_service.refresh_access_token(user_id)

        # Повторяем запрос с новым токеном
        return await self._make_google_api_request(
            user_id, url, method, headers, json_data, data, retry_count + 1
        )

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

            # Используем универсальный метод с обработкой 401
            res = await self._make_google_api_request(
                user_id=user_id,
                url=self.calendat_list,
                method=HttpMethod.GET
            )

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

            # Используем универсальный метод с обработкой 401
            url = f"{self.all_event.format(calendarId=email_and_access[0])}{'?syncToken='+token if token else ''}"
            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET
            )

            if res.get("status_code") == 410:
                 return await self.get_all_user_calendar_events(user_id, True, fullResponse)

            # Сохраняем sync token в БД и кеш
            if res.get("nextSyncToken"):
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

            # Используем универсальный метод с обработкой 401
            url = self.specific_event.format(calendarId=email_and_access[0], eventId=event_id)
            headers = {"If-None-Match": etag[0]} if etag else None

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET,
                headers=headers
            )

            if res.get("status_code") == 304:
                # Событие не изменилось, возвращаем из БД
                event_data = await self.calendar_repo.get_event_from_id(user_id, event_id)
                # Кешируем событие
                await self.cache_service.cache_single_event(user_id, event_data)
                return dict({"status": "not changed"}, **event_data)

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

            # Используем универсальный метод с обработкой 401
            url = self.watch_url.format(calendarId=email_and_access[0])
            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.POST,
                json_data=webhook_payload
            )

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

            # Отправляем запрос на отписку в Google
            stop_payload = {
                "id": channel_id,
                "resourceId": resource_id
            }

            # Используем универсальный метод с обработкой 401
            await self._make_google_api_request(
                user_id=user_id,
                url=self.stop_watch_url,
                method=HttpMethod.POST,
                json_data=stop_payload
            )

            # Удаляем подписку из БД
            await self.calendar_repo.delete_webhook_subscription(channel_id)

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def update_event_from_webhook(self, user_id: str, event_id: str):
        """
        Обновляет конкретное событие по ID с использованием etag.
        Вызывается при получении вебхука об изменении события.
        """
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id)
            etag = await self.calendar_repo.get_etag_from_id(user_id, event_id)

            # Используем универсальный метод с обработкой 401
            url = self.specific_event.format(calendarId=email_and_access[0], eventId=event_id)
            headers = {"If-None-Match": etag[0]} if etag else None

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET,
                headers=headers
            )

            if res.get("status_code") == 304:
                # Событие не изменилось
                event_data = await self.calendar_repo.get_event_from_id(user_id, event_id)
                return {
                    "status": "not_changed",
                    "message": "Event has not been modified",
                    "event": event_data
                }

            if res.get("status_code") == 404:
                # Событие было удалено - удаляем из БД и кеша
                await self.calendar_repo.remove_event_from_cache(user_id, event_id)
                await self.cache_service.remove_event_from_cache(user_id, event_id)
                return {
                    "status": "deleted",
                    "message": "Event was deleted",
                    "event_id": event_id
                }

            # Обновляем событие в БД и кеше
            await self.calendar_repo.update_item(user_id=user_id, data=res)
            await self.cache_service.update_event_in_cache(user_id, res)
            return {
                "status": "updated",
                "message": "Event updated successfully",
                "event": res
            }

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def update_event(self, user_id: str, event_id: str, update_data: UpdateEventRequest) -> EventUpdateResponse:
        """
        Обновляет существующее событие в Google Calendar.
        Поддерживает частичное обновление - передавайте только те поля, которые нужно изменить.
        Автоматически обрабатывает 401 ошибки и обновляет access token.

        Args:
            user_id: ID пользователя
            event_id: ID события для обновления
            update_data: Данные для обновления (все поля опциональные)

        Returns:
            EventUpdateResponse: Результат обновления события
        """
        try:
            # Получаем доступ и email пользователя
            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)

            # Сначала получаем текущее событие для получения etag
            current_event = await self.get_event_from_id(user_id, event_id)
            if not current_event:
                raise HTTPException(
                    status_code=404,
                    detail=f"Event with ID {event_id} not found"
                )

            # Подготавливаем данные для обновления
            # Исключаем None значения из данных
            update_payload = update_data.model_dump(exclude_none=True)

            if not update_payload:
                raise HTTPException(
                    status_code=400,
                    detail="No fields provided for update"
                )

            # Отслеживаем какие поля обновляем
            updated_fields = list(update_payload.keys())

            # Используем универсальный метод с обработкой 401
            url = self.specific_event.format(
                calendarId=email_and_access[0],
                eventId=event_id
            )
            headers = {"If-Match": current_event.get("etag", "")}

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.PATCH,
                json_data=update_payload,
                headers=headers
            )

            if res.get("status_code") == 412:
                # Precondition Failed - событие было изменено другим процессом
                raise HTTPException(
                    status_code=409,
                    detail="Event was modified by another process. Please refresh and try again."
                )

            if res.get("status_code") == 404:
                raise HTTPException(
                    status_code=404,
                    detail=f"Event with ID {event_id} not found"
                )

            # Обновляем событие в БД и кеше
            await self.calendar_repo.update_item(user_id=user_id, data=res)
            await self.cache_service.update_event_in_cache(user_id, res)

            return EventUpdateResponse(
                status="success",
                event_id=event_id,
                updated_fields=updated_fields,
                message=f"Event updated successfully. Modified fields: {', '.join(updated_fields)}"
            )

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update event: {str(e)}")

    async def bulk_update_events(self, user_id: str, event_updates: List[Dict[str, Any]]) -> List[EventUpdateResponse]:
        """
        Массовое обновление нескольких событий.
        Автоматически обрабатывает 401 ошибки для каждого события.

        Args:
            user_id: ID пользователя
            event_updates: Список словарей с event_id и update_data

        Returns:
            List[EventUpdateResponse]: Результаты обновления каждого события
        """
        results = []

        for event_update in event_updates:
            try:
                event_id = event_update.get("event_id")
                update_data = UpdateEventRequest(**event_update.get("update_data", {}))

                result = await self.update_event(user_id, event_id, update_data)
                results.append(result)

            except Exception as e:
                # Записываем ошибку для конкретного события, но продолжаем обработку остальных
                results.append(EventUpdateResponse(
                    status="error",
                    event_id=event_update.get("event_id", "unknown"),
                    updated_fields=[],
                    message=f"Error updating event: {str(e)}"
                ))

        return results

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

            # Используем универсальный метод с обработкой 401
            res = await self._make_google_api_request(
                user_id=user_id,
                url=self.calendat_list,
                method=HttpMethod.GET
            )

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

            # Используем универсальный метод с обработкой 401
            url = f"{self.all_event.format(calendarId=email_and_access[0])}{'?syncToken='+token if token else ''}"
            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET
            )

            if res.get("status_code") == 410:
                 return await self.get_all_user_calendar_events(user_id, True, fullResponse)

            # Сохраняем sync token в БД и кеш
            if res.get("nextSyncToken"):
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

            # Используем универсальный метод с обработкой 401
            url = self.specific_event.format(calendarId=email_and_access[0], eventId=event_id)
            headers = {"If-None-Match": etag[0]} if etag else None

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET,
                headers=headers
            )

            if res.get("status_code") == 304:
                # Событие не изменилось, возвращаем из БД
                event_data = await self.calendar_repo.get_event_from_id(user_id, event_id)
                # Кешируем событие
                await self.cache_service.cache_single_event(user_id, event_data)
                return dict({"status": "not changed"}, **event_data)

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

            # Используем универсальный метод с обработкой 401
            url = self.watch_url.format(calendarId=email_and_access[0])
            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.POST,
                json_data=webhook_payload
            )

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

            # Отправляем запрос на отписку в Google
            stop_payload = {
                "id": channel_id,
                "resourceId": resource_id
            }

            # Используем универсальный метод с обработкой 401
            await self._make_google_api_request(
                user_id=user_id,
                url=self.stop_watch_url,
                method=HttpMethod.POST,
                json_data=stop_payload
            )

            # Удаляем подписку из БД
            await self.calendar_repo.delete_webhook_subscription(channel_id)

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def update_event_from_webhook(self, user_id: str, event_id: str):
        """
        Обновляет конкретное событие по ID с использованием etag.
        Вызывается при получении вебхука об изменении события.
        """
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id)
            etag = await self.calendar_repo.get_etag_from_id(user_id, event_id)

            # Используем универсальный метод с обработкой 401
            url = self.specific_event.format(calendarId=email_and_access[0], eventId=event_id)
            headers = {"If-None-Match": etag[0]} if etag else None

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET,
                headers=headers
            )

            if res.get("status_code") == 304:
                # Событие не изменилось
                event_data = await self.calendar_repo.get_event_from_id(user_id, event_id)
                return {
                    "status": "not_changed",
                    "message": "Event has not been modified",
                    "event": event_data
                }

            if res.get("status_code") == 404:
                # Событие было удалено - удаляем из БД и кеша
                await self.calendar_repo.remove_event_from_cache(user_id, event_id)
                await self.cache_service.remove_event_from_cache(user_id, event_id)
                return {
                    "status": "deleted",
                    "message": "Event was deleted",
                    "event_id": event_id
                }

            # Обновляем событие в БД и кеше
            await self.calendar_repo.update_item(user_id=user_id, data=res)
            await self.cache_service.update_event_in_cache(user_id, res)
            return {
                "status": "updated",
                "message": "Event updated successfully",
                "event": res
            }

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
