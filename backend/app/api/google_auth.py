from typing import Annotated
from fastapi import APIRouter, Body, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi import status

from dependencies import get_user_request_id
from service import GoogleOauthService


router = APIRouter(prefix="/google", tags=["google"])
google_service = GoogleOauthService()

@router.get("/")
def get_google_oauth_redirect_uri():
    """
    :return: редиректит пользователя на страницу регистарции гугла с правильной ссылкой
    """
    uri = google_service.generate_google_oauth_redirect_uri()
    return RedirectResponse(url=uri, status_code=status.HTTP_302_FOUND)


@router.post("/callback")
async def handle_code(
    code: Annotated[str, Body(embed=True)],
):
    """
    :param code: квери параметр который гугл вставляет в ссылку при редиректе, нужно для получения данных пользователя
    :return: Возвращает данные пользователя, такие как, имя, емаил, фото. Так же данные хранит в базу данных
    """
    try:
        return await google_service.get_user_info(code)
    except HTTPException as e:
        raise e 

@router.post("/refresh_access_token")
async def refreshing_access_token(
    user_id: Annotated[str, Depends(get_user_request_id)],
):
    """

    :param user_id: id добывает из access token из bearer
    :return:
    """
    return await google_service.refresh_access_token(user_id)


