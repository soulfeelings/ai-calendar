from database import mongodb
from pymongo import UpdateOne

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

        if res.modified_count != 1:
            raise ValueError("Update user calendars list failed")

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