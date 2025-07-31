from typing import Annotated
from fastapi import APIRouter, Body
from fastapi.responses import RedirectResponse
from fastapi import status
from service import GoogleOauthService


router = APIRouter(prefix="/auth", tags=["auth"])
google_service = GoogleOauthService()

@router.get("/google")
def get_google_oauth_redirect_uri():
    uri = google_service.generate_google_oauth_redirect_uri()
    return RedirectResponse(url=uri, status_code=status.HTTP_302_FOUND)


@router.post("/google/callback")
async def handle_code(
    code: Annotated[str, Body(embed=True)],
):
    return await google_service.get_user_info(code)


