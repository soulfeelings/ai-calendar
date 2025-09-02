from fastapi import APIRouter, Depends, status, HTTPException, Body
from dependencies import get_user_request_id, get_auth_service
from typing import Annotated
from service import AuthService
from exception import RefreshTokenExpiredError, TokenNotCorrectError, TokenExpiredError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
)
async def get_my_info(
    user_id: Annotated[str, Depends(get_user_request_id)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
):
    try:
        return await auth_service.get_user_info_from_sub(user_id)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))



@router.post(
    "/refresh",
    status_code=status.HTTP_200_OK,
)
async def update_access(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    refresh_token: str = Body(embed=True),
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


@router.get(
    "/validate",
    status_code=status.HTTP_200_OK
)
async def validate_access(
    user_id: Annotated[str, Depends(get_user_request_id)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)]
):
    try:
        return {"valid": True, "user_id": user_id}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
)
async def logout_profile(
    user_id: Annotated[str, Depends(get_user_request_id)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)]
):
    return await auth_service.logout(user_id)
