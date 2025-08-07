from fastapi import security, Security, Depends, HTTPException, status
from service import AuthService, GoogleOauthService, CalendarService
from exception import TokenExpiredError, TokenNotCorrectError
from cache import AsyncRedisManager
from repository import AuthRepo, GoogleOauthRepo, CalendarRepo

def get_auth_repo() -> AuthRepo:
    return AuthRepo()

def get_auth_service(
        auth_repo : AuthRepo = Depends(get_auth_repo),
) -> AuthService:
    return AuthService(auth_repo=auth_repo)

def get_google_oauth_repo() -> GoogleOauthRepo:
    return GoogleOauthRepo()

def get_google_oauth_service(
 google_oauth_repo: GoogleOauthRepo = Depends(get_google_oauth_repo),
) -> GoogleOauthService:
    return GoogleOauthService(google_oauth_repo=google_oauth_repo)

def get_calendar_repo() -> CalendarRepo:
    return CalendarRepo()

def get_calendar_service(
    calendar_repo: CalendarRepo = Depends(get_calendar_repo),
) -> CalendarService:
    return CalendarService(calendar_repo=calendar_repo)



async def get_redis():
    redis = AsyncRedisManager()
    try:
        yield redis
    finally:
        await redis.pool.close()

def get_user_request_id(
        auth_service: AuthService = Depends(get_auth_service),
        token: security.http.HTTPAuthorizationCredentials = Security(security.HTTPBearer())
):
    try:
        user_id = auth_service.get_user_id_from_access_token(token.credentials)

    except TokenExpiredError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Not authenticated: {e.detail}",
        )
    except TokenNotCorrectError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.detail,
        )

    return user_id
