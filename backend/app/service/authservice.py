from datetime import datetime, timedelta, timezone
import jwt
from fastapi import HTTPException, status
from settings import settings
from exception import TokenNotCorrectError, TokenExpiredError
from repository import AuthRepo
import aiohttp

auth_repo = AuthRepo()


class AuthService:
    @staticmethod
    def get_user_id_from_access_token(access_token: str):
        try:
            payload = jwt.decode(access_token, settings.SECRET_JWT_KEY, algorithms="HS256")
        except jwt.InvalidTokenError:
            raise TokenNotCorrectError

        if payload["exp"] < datetime.now().timestamp():
            raise TokenExpiredError

        return payload["sub"]

    async def get_user_info_from_sub(self, sub):
        try:
            res = await auth_repo.get_info_from_sub(sub)
            return res
        except ValueError:
            raise

    async def update_refresh_token(self, refresh_token: str):
        try:
            user_id = await auth_repo.get_info_from_refresh(refresh_token=refresh_token)
            access_payload = {
                    "sub": user_id,
                    "exp": datetime.now(timezone(timedelta(hours=3))) + timedelta(minutes=40),
            }

            access_token = jwt.encode(access_payload, settings.SECRET_JWT_KEY, algorithm="HS256")

            return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 2400,
        }

        except ValueError:
            raise

    async def logout(self, user_id):
        return await auth_repo.update_revoked_and_google_tokens(user_id)

