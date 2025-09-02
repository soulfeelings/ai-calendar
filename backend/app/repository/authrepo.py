from datetime import datetime

from fastapi import HTTPException

from exception import RefreshTokenExpiredError, TokenNotCorrectError, RevokedError
from database import mongodb

class AuthRepo:
    async def get_info_from_sub(self, sub: str):
        user_info = await mongodb.users.find_one({"user_sub": sub})
        if not user_info:
            raise ValueError("Неправильное id или не зарегистрирован")

        user_refresh = await mongodb.refresh_tokens.find_one({"sub": sub})

        if user_refresh['is_revoked']:
            raise RevokedError

        return {
            "email": user_info["user_data"]["email"],
            "name": user_info["user_data"]["name"],
            "picture": user_info["user_data"]["picture"],
            }

    async def get_info_from_refresh(self, refresh_token: str):
        refresh_info = await mongodb.refresh_tokens.find_one({"refresh_token": refresh_token})
        if not refresh_info:
            raise ValueError("Неверный токен")

        if refresh_info["refresh_expires_in"] < datetime.now():
            raise RefreshTokenExpiredError

        return refresh_info['sub']


    async def update_revoked_and_google_tokens(self, user_id):
        res = await mongodb.refresh_tokens.update_one(
            {"sub": user_id},
            {"$set": {"is_revoked": True}},
        )

        res1 = await mongodb.users.update_one(
            {"user_sub": user_id},
            {"$set": {"access_token": ""}},)

        if res.modified_count + res1.modified_count != 2:
            raise HTTPException(status_code=404, detail="Not Found. Check token")

        return True