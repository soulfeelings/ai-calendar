from datetime import datetime

from settings import settings
import urllib.parse
import aiohttp
from fastapi import HTTPException, status
import jwt
import secrets
from repository import GoogleOauthRepo

google_oauth_repo = GoogleOauthRepo()


class GoogleOauthService:
    google_token_url: str = "https://oauth2.googleapis.com/token"

    def generate_google_oauth_redirect_uri(self):
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

                await google_oauth_repo.add_user(
                    {
                        "user_sub": user_data["sub"],
                        "access_token": res["access_token"],
                        "refresh_token": res["refresh_token"],
                        "expires_in": res["expires_in"],
                        "refresh_token_expires_in": res["refresh_token_expires_in"],
                        "user_data": {
                            "email": user_data["email"],
                            "name": user_data["name"],
                            "picture": user_data["picture"],
                        },
                        "updated_at": datetime.now()
                    }
                )

                return {
                    "email": user_data["email"],
                    "name": user_data["name"],
                    "picture": user_data["picture"],
                }

    def decode_id_token(self, id_token: str):
        return jwt.decode(id_token,
                          algorithms=["RS256"],
                          options={"verify_signature": False})