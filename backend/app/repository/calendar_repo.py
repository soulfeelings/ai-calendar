from database import mongodb

class CalendarRepo:
    async def get_user_scope(self, user_id):
        res = await mongodb.users.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("User not found")

        return res["scope"], res['user_data']["email"]

    async def update_user_scope(self, user_id, scope, access_token = None, refresh_token = None):
        await mongodb.users.update_one({"user_sub": user_id},
                                   {"$set":
                                        {"scope": scope,
                                         "access_token": access_token,
                                         "refresh_token": refresh_token}})
        return True


    async def get_access_token(self, user_id):
        res = await mongodb.users.find_one({"user_sub": user_id})

        if not res:
            raise ValueError("User not found")

        return res["access_token"]