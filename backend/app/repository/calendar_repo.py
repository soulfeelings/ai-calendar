from database import mongodb

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

    async def get_events_synct_and_email(self, user_id):
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

        if res.modified_count != 1:
            raise ValueError("Вставка данных произашла с ошибкой")

        return True