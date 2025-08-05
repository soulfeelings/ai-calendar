from fastapi import HTTPException, status, Depends, APIRouter, Body
from dependencies import get_user_request_id
from typing import Annotated
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
