from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from settings import settings
import urllib.parse
import aiohttp
from fastapi import HTTPException, status
import jwt
import secrets
from repository import GoogleOauthRepo



@dataclass
class GoogleOauthService:
    google_oauth_repo: GoogleOauthRepo
    google_token_url: str = "https://oauth2.googleapis.com/token"

    @staticmethod
    def generate_google_oauth_redirect_uri():
        query_params = {
            "client_id": settings.CLIENT_ID,
            "redirect_uri": "http://localhost:8000/",
            "response_type": "code",
            "scope": " ".join([
                "https://www.googleapis.com/auth/calendar",
                "openid",
                "profile",
                "email",
            ]),
            "access_type": "offline",
            #TODO: "state": ,
        }

        query_string = urllib.parse.urlencode(query_params, quote_via=urllib.parse.quote)
        base_url = "https://accounts.google.com/o/oauth2/v2/auth"
        return f'{base_url}?{query_string}'

    async def get_user_info(self, code: str):
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url=self.google_token_url,
                data={
                    "client_id": settings.CLIENT_ID,
                    "client_secret": settings.CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "redirect_uri": "http://localhost:8000/",
                    "code": code,
                }
            ) as response:
                res = await response.json()

                if response.status != 200:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res)


                user_data = self.decode_id_token(res["id_token"])

                await self.google_oauth_repo.add_user(
                    {
                        "user_sub": user_data["sub"],
                        "access_token": res["access_token"],
                        "refresh_token": res["refresh_token"],
                        "expires_in": res["expires_in"],
                        "refresh_token_expires_in": res["refresh_token_expires_in"],
                        "scope": res["scope"],
                        "user_data": {
                            "email": user_data["email"],
                            "name": user_data["name"],
                            "picture": user_data["picture"],
                        },
                        "updated_at": datetime.now()
                    }
                )

                return await self.generate_jwt_token(
                    sub=user_data["sub"],
                )

    @staticmethod
    def decode_id_token(id_token: str):
        return jwt.decode(id_token,
                          algorithms=["RS256"],
                          options={"verify_signature": False})


    async def generate_jwt_token(self, sub):
        refresh_token = secrets.token_urlsafe(64)
        refresh_expires = datetime.now(timezone(timedelta(hours=3))) + timedelta(days=90)

        access_payload = {
            "sub": sub,
            "exp": datetime.now() + timedelta(minutes=40),
        }

        access_token = jwt.encode(access_payload, settings.SECRET_JWT_KEY, algorithm="HS256")

        await self.google_oauth_repo.add_refresh(
            {
                "sub": sub,
                "refresh_token": refresh_token,
                "refresh_expires_in": refresh_expires,
                'access_expitres_in': datetime.now(timezone(timedelta(hours=3))) + timedelta(minutes=40),
                "is_revoked": False
            }
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 2400,
        }

    async def refresh_access_token(self, user_id):
        try:
            user_refresh = await self.google_oauth_repo.get_user_refresh_token(user_id)

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url="https://oauth2.googleapis.com/token",
                    headers = {
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    data={
                        "client_id": settings.CLIENT_ID,
                        "client_secret": settings.CLIENT_SECRET,
                        "refresh_token": user_refresh,
                        "grant_type": "refresh_token",
                    }
                ) as response:
                    res = await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=400, detail=res)

                    return await self.google_oauth_repo.update_user_success(user_id, res)

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))