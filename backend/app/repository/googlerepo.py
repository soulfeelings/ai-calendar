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

    @staticmethod
    async def add_refresh(refresh_data: dict):
        await mongodb.refresh_tokens.replace_one(
            {"sub": refresh_data["sub"]},
            refresh_data,
            upsert=True
        )
        return True

    async def get_user_refresh_token(self, user_id):
        user_refresh = await mongodb.users.find_one({"user_sub": user_id})

        if not user_refresh:
            raise ValueError("User not found")

        return user_refresh["refresh_token"]

    async def update_user_success(self, user_id, data: dict):
        res = await mongodb.users.update_one(
            {"user_sub": user_id},
            {"$set": {
                "access_token": data["access_token"],
                "expires_in": data["expires_in"],
                "scope": data["scope"],
                "token_type": data["token_type"],
            }}
        )

        if res.modified_count != 1:
            raise ValueError("Not user is found")

        return True