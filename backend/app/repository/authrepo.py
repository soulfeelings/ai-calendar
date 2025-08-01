from datetime import datetime
from exception import RefreshTokenExpiredError, TokenNotCorrectError
from database import mongodb

class AuthRepo:
    async def get_info_from_sub(self, sub):
        user_info = await mongodb.users.find_one({"user_sub": sub})
        if not user_info:
            raise ValueError("Неправильное id или не зарегистрирован")

        return {
            "email": user_info["user_data"]["email"],
            "name": user_info["user_data"]["name"],
            "picture": user_info["user_data"]["picture"],
            }

    async def get_info_from_refresh(self, refresh_token):
        refresh_info = await mongodb.refresh_tokens.find_one({"refresh_token": refresh_token})
        if not refresh_info:
            raise ValueError("Неверный токен")

        if refresh_info["refresh_expires_in"] < datetime.now():
            raise RefreshTokenExpiredError

        return refresh_info['sub']