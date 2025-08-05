from fastapi import Depends, APIRouter, Body
from dependencies import get_user_request_id
from typing import Annotated, Optional
from service import CalendarService

router = APIRouter(prefix="/calendar", tags=["google_calendar"])
calendar_service = CalendarService()


@router.get("/list")
async def get_calendar_list(
    user_id: Annotated[str, Depends(get_user_request_id)],
):
    return await calendar_service.get_calendar_list(user_id)

@router.post("/code")
async def update_scope(
    user_id: Annotated[str, Depends(get_user_request_id)],
    code: Annotated[str, Body(embed=True)],
):
    return await calendar_service.update_user_scope(user_id, code)

@router.get("/events")
async def get_all_calendar_events(
    user_id: Annotated[str, Depends(get_user_request_id)],
):
    return await calendar_service.get_all_user_calendar_events(user_id)

@router.get("/event/{event_id}")
async def get_event(
    user_id: Annotated[str, Depends(get_user_request_id)],
    event_id: str
):
    return await calendar_service.get_event_from_id(user_id, event_id)