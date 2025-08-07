from fastapi import Depends, APIRouter, Body, Query
from dependencies import get_user_request_id, get_calendar_service
from typing import Annotated, Optional
from service import CalendarService

router = APIRouter(prefix="/calendar", tags=["google_calendar"])


@router.get("/list")
async def get_calendar_list(
    user_id: Annotated[str, Depends(get_user_request_id)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    return await calendar_service.get_calendar_list(user_id)

@router.post("/code")
async def update_scope(
    user_id: Annotated[str, Depends(get_user_request_id)],
    code: Annotated[str, Body(embed=True)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
):
    return await calendar_service.update_user_scope(user_id, code)

@router.get("/events")
async def get_all_calendar_events(
    user_id: Annotated[str, Depends(get_user_request_id)],
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)],
    forcefullsync: Optional[bool] = Query(default=False),
    fullresponse: Optional[bool] = Query(default=False),
):
    return await calendar_service.get_all_user_calendar_events(user_id, forcefullsync, fullresponse)

@router.get("/event/{event_id}")
async def get_event(
    user_id: Annotated[str, Depends(get_user_request_id)],
    event_id: str,
    calendar_service: Annotated[CalendarService, Depends(get_calendar_service)]
):
    return await calendar_service.get_event_from_id(user_id, event_id)