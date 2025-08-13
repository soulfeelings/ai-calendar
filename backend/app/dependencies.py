from fastapi import security, Security, Depends, HTTPException, status
from service import AuthService, GoogleOauthService, CalendarService
from service.calendar_cache_service import CalendarCacheService
from exception import TokenExpiredError, TokenNotCorrectError
from cache import AsyncRedisManager
from repository import AuthRepo, GoogleOauthRepo, CalendarRepo
from database.accessor import MongoDB
from settings import settings

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

def get_redis_manager() -> AsyncRedisManager:
    return AsyncRedisManager()

def get_calendar_cache_service(
    redis_manager: AsyncRedisManager = Depends(get_redis_manager),
) -> CalendarCacheService:
    return CalendarCacheService(redis_manager=redis_manager)

def get_calendar_service(
    calendar_repo: CalendarRepo = Depends(get_calendar_repo),
    cache_service: CalendarCacheService = Depends(get_calendar_cache_service),
    google_oauth_service: GoogleOauthService = Depends(get_google_oauth_service),
) -> CalendarService:
    return CalendarService(
        calendar_repo=calendar_repo,
        cache_service=cache_service,
        google_oauth_service=google_oauth_service
    )

async def get_redis():
    redis = AsyncRedisManager()
    try:
        yield redis
    finally:
        await redis.pool.close()

def get_cache_accessor() -> AsyncRedisManager:
    """Получение аксессора кеша для Celery"""
    return AsyncRedisManager()

def get_database_accessor():
    """Получение аксессора базы данных для Celery"""
    from database.accessor import MongoDB
    return MongoDB(
        host=settings.MONGO_HOST,
        port=settings.MONGO_PORT,
        username=settings.MONGO_USERNAME,
        password=settings.MONGO_PASSWORD,
        db=settings.MONGO_DB
    )

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
