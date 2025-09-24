import urllib.parse
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import aiohttp
from enum import Enum
from fastapi import HTTPException, status
from repository.calendar_repo import CalendarRepo
from service.calendar_cache_service import CalendarCacheService
from service.googleoauth import GoogleOauthService
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
    all_event: str = "https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events"
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
            return {"status": "success", "message": "Operation completed successfully", "status_code": 204}

        # Явная обработка 304 (Not Modified)
        if response.status == 304:
            return {"status": "success", "message": "Not Modified", "status_code": 304}

        # Для остальных статусов пытаемся получить JSON
        try:
            res = await response.json()
        except Exception:
            res = {"message": "No JSON response", "status_code": response.status}

        if response.status not in [200, 201, 204, 304]:
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
            scope = []

            if "https://www.googleapis.com/auth/calendar.readonly" not in user_scope[0].split():
                scope.append("https://www.googleapis.com/auth/calendar.readonly")

            if "https://www.googleapis.com/auth/calendar.events" not in user_scope[0].split():
                scope.append("https://www.googleapis.com/auth/calendar.events")

            if scope:

                query_params = {
                    "client_id": settings.CLIENT_ID,
                    "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
                    "response_type": "code",
                    "scope": " ".join(scope),
                    "access_type": "offline",
                    "login_hint": user_scope[1],
                    # TODO: "state": ,
                }

                query_string = urllib.parse.urlencode(query_params, quote_via=urllib.parse.quote)
                base_url = "https://accounts.google.com/o/oauth2/v2/auth"
                auth_url = f'{base_url}?{query_string}'

                # Возвращаем JSON с URL для авторизации вместо редиректа
                return {
                    "requires_authorization": True,
                    "authorization_url": auth_url,
                    "message": "Calendar access not granted. Please authorize."
                }

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
                            "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
                            "code": code,
                        }
                ) as response:
                    res = await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res)

                    user_sub = await self.calendar_repo.get_user_scope(user_id)

                    await self.calendar_repo.update_user_scope(
                        user_id,
                        scope=f"{user_sub[0]} {res['scope']}",
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

            # Определяем временные рамки: неделя назад и далее
            time_min = (datetime.now() - timedelta(weeks=1)).isoformat() + 'Z'

            # Строим URL с параметрами времени
            base_url = self.all_event.format(calendarId=email_and_access[0])
            params = []

            if token:
                params.append(f"syncToken={token}")
            else:
                # При полной синхронизации добавляем временные фильтры
                params.append(f"timeMin={time_min}")
                # Можно также добавить timeMax если нужно ограничить будущие события
                # time_max = (datetime.now() + timedelta(weeks=52)).isoformat() + 'Z'
                # params.append(f"timeMax={time_max}")

            url = f"{base_url}{'?' + '&'.join(params) if params else ''}"

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

    async def get_user_by_channel_id(self, channel_id: str) -> Optional[str]:
        """
        Получает user_id по channel_id из вебхука.
        """
        try:
            subscription = await self.calendar_repo.get_webhook_subscription(channel_id)
            if subscription:
                return subscription["user_id"]
            return None
        except Exception as e:
            print(f"Error getting user by channel ID: {str(e)}")
            return None

    async def handle_calendar_change_notification(
        self,
        user_id: str,
        channel_id: str,
        resource_id: Optional[str] = None,
        resource_uri: Optional[str] = None
    ):
        """
        Обрабатывает уведомление об изменении календаря от Google.
        Выполняет инкрементальную синхронизацию и обновляет кеш.
        """
        try:
            # Получаем sync token из кеша или БД
            sync_token = await self.cache_service.get_sync_token(user_id)
            if not sync_token:
                sync_token = await self.calendar_repo.get_synctoken_if_exists(user_id)
            
            # Если нет sync token, выполняем полную синхронизацию
            if not sync_token:
                await self._perform_full_sync(user_id)
                return
            
            # Выполняем инкрементальную синхронизацию
            await self._perform_incremental_sync(user_id, sync_token)
            
        except Exception as e:
            print(f"Error handling calendar change notification: {str(e)}")
            # При ошибке инкрементальной синхронизации выполняем полную
            await self._perform_full_sync(user_id)

    async def _perform_full_sync(self, user_id: str):
        """
        Выполняет полную синхронизацию календаря пользователя.
        """
        try:
            # Инвалидируем кеш
            await self.cache_service.invalidate_user_cache(user_id)
            
            # Получаем все события без sync token
            await self.get_all_user_calendar_events(user_id, forceFullSync=True, fullResponse=False)
            
        except Exception as e:
            print(f"Error in full sync: {str(e)}")
            raise

    async def _perform_incremental_sync(self, user_id: str, sync_token: str):
        """
        Выполняет инкрементальную синхронизацию календаря.
        """
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id)
            
            # Запрашиваем изменения с момента последнего sync token
            url = f"{self.all_event.format(calendarId=email_and_access[0])}?syncToken={sync_token}"
            
            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.GET
            )
            
            # Если sync token недействителен (410 ошибка), выполняем полную синхронизацию
            if res.get("status_code") == 410:
                await self._perform_full_sync(user_id)
                return
            
            # Сохраняем новый sync token
            if res.get("nextSyncToken"):
                await self.calendar_repo.update_synctoken(user_id, res["nextSyncToken"])
                await self.cache_service.cache_sync_token(user_id, res["nextSyncToken"])
            
            # Обрабатываем измененные события
            if res.get("items"):
                await self._process_changed_events(user_id, res["items"])
                
        except Exception as e:
            print(f"Error in incremental sync: {str(e)}")
            raise

    async def _process_changed_events(self, user_id: str, events: List[Dict[str, Any]]):
        """
        Обрабатывает список измененных событий.
        """
        try:
            for event in events:
                event_id = event.get("id")
                if not event_id:
                    continue
                
                if event.get("status") == "cancelled":
                    # Удаляем отмененное событие из БД и кеша
                    await self.calendar_repo.remove_event_from_cache(user_id, event_id)
                    await self.cache_service.remove_event_from_cache(user_id, event_id)
                else:
                    # Обновляем измененное событие в БД и кеше
                    await self.calendar_repo.update_item(user_id, event)
                    await self.cache_service.update_event_in_cache(user_id, event)
            
            # Инвалидируем общий кеш событий пользователя для обновления при следующем запросе
            await self.cache_service.invalidate_user_cache(user_id)
            
        except Exception as e:
            print(f"Error processing changed events: {str(e)}")
            raise

    async def create_event(self, user_id: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """Создает новое событие в календаре пользователя."""
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            url = self.all_event.format(calendarId=email_and_access[0])

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.POST,
                json_data=event_data
            )

            # Если Google вернул объект события — сохраняем
            if res.get("id"):
                await self.calendar_repo.add_item(user_id, res)
                await self.cache_service.update_event_in_cache(user_id, res)

            return res
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create event: {str(e)}")

    async def delete_event(self, user_id: str, event_id: str) -> Dict[str, Any]:
        """Удаляет событие из календаря пользователя."""
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            url = self.specific_event.format(calendarId=email_and_access[0], eventId=event_id)

            res = await self._make_google_api_request(
                user_id=user_id,
                url=url,
                method=HttpMethod.DELETE
            )

            # Удаляем из локального хранилища (БД + кеш)
            try:
                await self.calendar_repo.remove_event_from_cache(user_id, event_id)
            except Exception:
                pass
            await self.cache_service.remove_event_from_cache(user_id, event_id)

            return res if res else {"status": "success", "message": "Event deleted"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete event: {str(e)}")

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

            # Если Google вернул 304 или 204, считаем, что менять нечего/успех без контента
            if res.get("status_code") in [304, 204]:
                return EventUpdateResponse(
                    status="success",
                    event_id=event_id,
                    updated_fields=updated_fields,
                    message=("Event not modified (304). Nothing to update." if res.get("status_code") == 304 else "Operation completed successfully (204)")
                )

            # Обновляем событие в БД и кеше (ожидаем, что res содержит объект события)
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

    async def setup_calendar_webhook(self, user_id: str) -> Dict[str, Any]:
        """
        Настраивает вебхук для получения уведомлений об изменениях в календаре.
        """
        try:
            webhook_info = await self.calendar_repo.get_user_webhook_info_if_exists(user_id)
            if webhook_info:
                return webhook_info

            email_and_access = await self.calendar_repo.get_access_and_email(user_id)

            # Генерируем уникальный channel_id
            channel_id = str(uuid.uuid4())

            # Настраиваем webhook
            webhook_payload = {
                "id": channel_id,
                "type": "web_hook",
                "address": f"{settings.WEBHOOK_BASE_URL}/webhook/google-calendar",
                "token": f"user_{user_id}",  # Токен для верификации
                "expiration": int((datetime.now() + timedelta(days=7)).timestamp() * 1000)  # 7 дней
            }

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
                expiration=webhook_payload["expiration"]
            )

            return {
                "channel_id": channel_id,
                "resource_id": res.get("resourceId"),
                "expiration": webhook_payload["expiration"]
            }

        except Exception as e:
            print(f"Error setting up webhook: {str(e)}")
            raise

    async def get_webhook_status(self, user_id: str) -> Dict[str, Any]:
        """
        Получает статус вебхука для пользователя.
        """
        try:
            subscriptions = await self.calendar_repo.get_user_webhook_subscriptions(user_id)
            
            active_subscriptions = []
            expired_subscriptions = []
            
            current_time = datetime.now().timestamp() * 1000
            
            for sub in subscriptions:
                if sub.get("expiration", 0) > current_time:
                    active_subscriptions.append(sub)
                else:
                    expired_subscriptions.append(sub)
            
            return {
                "user_id": user_id,
                "active_subscriptions": active_subscriptions,
                "expired_subscriptions": expired_subscriptions,
                "total_active": len(active_subscriptions),
                "total_expired": len(expired_subscriptions)
            }
            
        except Exception as e:
            print(f"Error getting webhook status: {str(e)}")
            raise
