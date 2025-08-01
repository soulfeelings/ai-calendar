from fastapi import APIRouter, Depends, status, HTTPException
from dependencies import get_user_request_id
from typing import Annotated
from service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()

@router.get("/me")
async def get_my_info(
    user_id: Annotated[str, Depends(get_user_request_id)],
):
    try:
        print(user_id == '107970675453103784355')
        return await auth_service.get_user_info_from_sub(user_id)

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
