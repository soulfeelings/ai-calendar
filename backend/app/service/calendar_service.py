import urllib.parse
from fastapi import HTTPException, status
from repository.calendar_repo import CalendarRepo
import aiohttp
from fastapi.responses import RedirectResponse
from settings import settings

class CalendarService:
    calendar_repo = CalendarRepo()
    google_token_url: str = "https://oauth2.googleapis.com/token"
    calendat_list: str = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
    calendar_events: str = "https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events?syncToken={syncToken}"


    async def get_calendar_list(self, user_id):
        try:
            user_scope = await self.calendar_repo.get_user_scope(user_id)

            if "https://www.googleapis.com/auth/calendar" not in user_scope[0].split():
                query_params = {
                    "client_id": settings.CLIENT_ID,
                    "redirect_uri": "http://localhost:8000/",
                    "response_type": "code",
                    "scope": " ".join([
                        "https://www.googleapis.com/auth/calendar",
                    ]),
                    "access_type": "offline",
                    "login_hint": user_scope[1],
                    # TODO: "state": ,
                }

                query_string = urllib.parse.urlencode(query_params, quote_via=urllib.parse.quote)
                base_url = "https://accounts.google.com/o/oauth2/v2/auth"
                return RedirectResponse(url=f'{base_url}?{query_string}', status_code=status.HTTP_302_FOUND)

            user_access = await self.calendar_repo.get_access_token(user_id)

            async with aiohttp.ClientSession() as session:
                async with session.get(
                        url=self.calendat_list,
                        headers={
                        "Authorization": f"Bearer {user_access}"
                        }
                ) as response:
                    return await response.json()

        except Exception as e:
            raise

    async def update_user_scope(self, user_id, code):
        try:
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


                    user_sub = await self.calendar_repo.get_user_scope(user_id)

                    await self.calendar_repo.update_user_scope(
                        user_id,
                        scope=f"{user_sub[0]} {res["scope"]}",
                        access_token=res["access_token"],
                        refresh_token=res["refresh_token"],
                    )
        except Exception as e:
            raise
