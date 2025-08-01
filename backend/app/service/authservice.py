from datetime import datetime
import jwt
from settings import settings
from exception import TokenNotCorrectError, TokenExpiredError
from repository import AuthRepo

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

