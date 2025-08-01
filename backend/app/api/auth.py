from fastapi import APIRouter, Depends, status, HTTPException, Body
from dependencies import get_user_request_id
from typing import Annotated
from service import AuthService
from exception import RefreshTokenExpiredError

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/refresh")
async def update_access(
        refresh_token: str = Body(embed=True)
):
    try:
        new_access_token = await auth_service.update_refresh_token(refresh_token)
        return new_access_token

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    except RefreshTokenExpiredError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))