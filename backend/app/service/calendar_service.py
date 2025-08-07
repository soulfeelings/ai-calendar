import urllib.parse
from dataclasses import dataclass

from fastapi import HTTPException, status
from repository.calendar_repo import CalendarRepo
import aiohttp
from fastapi.responses import RedirectResponse
from settings import settings

@dataclass
class CalendarService:
    calendar_repo: CalendarRepo
    google_token_url: str = "https://oauth2.googleapis.com/token"
    calendat_list: str = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
    all_event: str = "https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events" #TODO: syncTOKEN
    specific_event: str = all_event+"/{eventId}"


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
                    res =  await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=response.status, detail=res)

                    await self.calendar_repo.update_user_calendar_list(user_id, res)

                    return res

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

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


        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def get_all_user_calendar_events(self, user_id, forceFullSync, fullResponse):
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            token = await self.calendar_repo.get_synctoken_if_exists(user_id=user_id)

            async with aiohttp.ClientSession() as session:
                if forceFullSync:
                    token = None

                async with session.get(
                    url=f"{self.all_event.format(calendarId=email_and_access[0])}{"?syncToken="+token if token else ""}",
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}"
                    }
                ) as response:
                    res = await response.json()

                    if response.status != 200:
                        raise HTTPException(status_code=response.status, detail=res)


                    await self.calendar_repo.update_synctoken(user_id, res["nextSyncToken"])

                    if not token:
                        await self.calendar_repo.insert_events(user_id=user_id, data=res)
                        return res

                    if res["items"]:
                        await self.calendar_repo.update_items(user_id=user_id, items=res["items"])
                        return res

                    if fullResponse:
                        return await self.calendar_repo.get_all_event(user_id=user_id)

                    return res

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    async def get_event_from_id(self, user_id, event_id):
        try:
            email_and_access = await self.calendar_repo.get_access_and_email(user_id=user_id)
            etag = await self.calendar_repo.get_etag_from_id(user_id, event_id)

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url=f"{self.specific_event.format(calendarId=email_and_access[0],eventId=event_id)}",
                    headers={
                        "Authorization": f"Bearer {email_and_access[1]}",
                        "If-None-Match": etag[0]
                    }
                ) as response:

                    if response.status == 304:
                        return dict({"status": "not changed"}, **(await self.calendar_repo.get_event_from_id(user_id, event_id)))

                    res = await response.json()

                    if response.status == 401:
                        raise HTTPException(status_code=response.status, detail=res)

                    elif response.status == 200:
                        await self.calendar_repo.update_item(user_id=user_id, data=res)


                    return dict({"status": "not changed"}, **res)

        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))