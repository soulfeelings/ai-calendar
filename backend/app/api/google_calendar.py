from fastapi import HTTPException, status, Depends, APIRouter, Body, Query
from dependencies import get_user_request_id
from typing import Annotated, Optional
from service import CalendarService
from datetime import datetime

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