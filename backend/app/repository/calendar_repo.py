from database import mongodb
from pymongo import UpdateOne
from datetime import datetime

class CalendarRepo:
    async def get_user_scope(self, user_id):
        res = await mongodb.users.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("User not found")

        return res["scope"], res['user_data']["email"]

    async def update_user_scope(self, user_id, scope, access_token = None, refresh_token = None):
        res = await mongodb.users.update_one({"user_sub": user_id},
                                   {"$set":
                                        {"scope": scope,
                                         "access_token": access_token,
                                         "refresh_token": refresh_token}})
        if res.modified_count != 1:
            raise ValueError("Update user calendars list failed")

        return True


    async def get_access_token(self, user_id):
        res = await mongodb.users.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("User not found")

        return res["access_token"]

    async def update_user_calendar_list(self, user_id, data: dict):
        res = await mongodb.calendarlist.replace_one(
            {"user_sub": user_id},
            {
                "user_sub": user_id,
                "data": data
            },
            upsert=True)

        if res.modified_count == 0 and res.upserted_id is None:
            raise ValueError("Update user calendars list failed: no changes made and no upsert")

        return True

    async def get_access_and_email(self, user_id):
        res1 = await mongodb.users.find_one({"user_sub": user_id})
        res2 = await self.get_access_token(user_id)

        if not res1:
            raise ValueError("События не найдены или их не существует")

        return res1["user_data"]["email"], res2

    async def insert_events(self, user_id, data):
        res = await mongodb.calendarevents.replace_one({"user_sub": user_id}, {
            "user_sub": user_id,
            "data": data
        }, upsert=True)

        if res.modified_count == 0 and not res.upserted_id:
            raise ValueError("Вставка данных произашла с ошибкой")

        return True

    async def get_etag_from_id(self, user_id, event_id):
        res: dict = await mongodb.calendarevents.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("Не найдены подхадящие события. Для начало поулчите все сообщения")

        items = res["data"]["items"]

        for k, v in enumerate(items):
            if v["id"] == event_id:
                return v["etag"], k


        raise ValueError("Не найден событий, обновите события")

    async def update_item(self, user_id, data: dict):
        res: dict = await mongodb.calendarevents.update_one(
            {"user_sub": user_id, 'data.items.id': data["id"]},
            {"$set":
                    {
                        f"data.items.$": data
                    }
            })

        return True

    async def get_event_from_id(self, user_id, event_id):
        res: dict = await mongodb.calendarevents.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("Не найдены подхадящие события. Для начало поулчите все сообщения")

        items = res["data"]["items"]

        for i in items:
            if i["id"] == event_id:
                return i

        raise ValueError("Не найден событий, обновите события")

    async def get_synctoken_if_exists(self, user_id):
        res = await mongodb.calendarevents.find_one({"user_sub": user_id})

        if not res:
            return None

        return res["data"]["nextSyncToken"]

    async def update_synctoken(self, user_id, next_sync_token):
        await mongodb.calendarevents.update_one({"user_sub": user_id},
                                                {"$set": {"data.nextSyncToken": next_sync_token}})

        return True

    async def update_items(self, user_id, items: list):
        operations = []
        for update in items:
            operations.append(
                UpdateOne(
                    {"user_sub": user_id, "data.items.id": update["id"]},
                    {"$set": {"data.items.$[elem]": update}},
                    array_filters=[{"elem.id": update["id"]}]
                )
            )

        await mongodb.calendarevents.bulk_write(operations)

    async def get_all_event(self, user_id):
        res = await mongodb.calendarevents.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("Данные не найдены, отправьте заного запрос без параметров")

        return res["data"]

    async def save_webhook_subscription(self, user_id: str, channel_id: str, resource_id: str, expiration: int):
        """
        Сохраняет информацию о подписке на вебхук в БД.
        """
        subscription_data = {
            "user_id": user_id,
            "channel_id": channel_id,
            "resource_id": resource_id,
            "expiration": expiration,
            "created_at": int(datetime.now().timestamp() * 1000),
            "last_sync": None
        }

        res = await mongodb.webhook_subscriptions.insert_one(subscription_data)

        if not res.inserted_id:
            raise ValueError("Failed to save webhook subscription")

        return True

    async def get_webhook_subscription(self, channel_id: str):
        """
        Получает информацию о подписке по channel_id.
        """
        res = await mongodb.webhook_subscriptions.find_one({"channel_id": channel_id})
        return res

    async def get_user_webhook_subscriptions(self, user_id: str):
        """
        Получает все подписки пользователя.
        """
        cursor = mongodb.webhook_subscriptions.find({"user_id": user_id})
        subscriptions = await cursor.to_list(length=None)
        return subscriptions

    async def delete_webhook_subscription(self, channel_id: str):
        """
        Удаляет подписку из БД.
        """
        res = await mongodb.webhook_subscriptions.delete_one({"channel_id": channel_id})

        if res.deleted_count != 1:
            raise ValueError("Failed to delete webhook subscription")

        return True

    async def update_webhook_last_sync(self, channel_id: str):
        """
        Обновляет timestamp последней синхронизации для подписки.
        """
        current_time = int(datetime.now().timestamp() * 1000)

        res = await mongodb.webhook_subscriptions.update_one(
            {"channel_id": channel_id},
            {"$set": {"last_sync": current_time}}
        )

        if res.modified_count != 1:
            raise ValueError("Failed to update webhook last sync")

        return True

    async def cleanup_expired_webhook_subscriptions(self):
        """
        Удаляет истекшие подписки из БД.
        """
        current_time = int(datetime.now().timestamp() * 1000)

        res = await mongodb.webhook_subscriptions.delete_many(
            {"expiration": {"$lt": current_time}}
        )

        return res.deleted_count

    async def remove_event_from_cache(self, user_id: str, event_id: str):
        """
        Удаляет событие из кэша (БД) когда оно было удалено в Google Calendar.
        """
        res = await mongodb.calendarevents.update_one(
            {"user_sub": user_id},
            {"$pull": {"data.items": {"id": event_id}}}
        )

        if res.modified_count != 1:
            raise ValueError("Failed to remove event from cache")

        return True

    async def get_user_tokens(self, user_id: str):
        """
        Получает токены пользователя (access_token и refresh_token).
        """
        res = await mongodb.users.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("User not found")

        return {
            "access_token": res.get("access_token"),
            "refresh_token": res.get("refresh_token")
        }

    async def update_access_token(self, user_id: str, access_token: str):
        """
        Обновляет только access_token пользователя.
        """
        res = await mongodb.users.update_one(
            {"user_sub": user_id},
            {"$set": {"access_token": access_token}}
        )

        if res.modified_count != 1:
            raise ValueError("Failed to update access token")

        return True

    async def get_user_webhook_info_if_exists(self, user_id):
        res = await mongodb.webhook_subscriptions.find_one({"user_id": user_id})

        print(res)
        if res:
            return {
                "channel_id": res['channel_id'],
                "resource_id": res["resource_id"],
                "expiration": res["expiration"]
            }

        return None