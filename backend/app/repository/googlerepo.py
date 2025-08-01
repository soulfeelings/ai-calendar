from database import mongodb


class GoogleOauthRepo:
    @staticmethod
    async def add_user(data: dict):
        try:
            await mongodb.users.replace_one(
                {"user_data.email": data["user_data"]["email"]},
                data,
                upsert=True
            )
        except Exception as e:
            print(f"Ошибка при работе с MongoDB: {e}")
            raise