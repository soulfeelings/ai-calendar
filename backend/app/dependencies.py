from fastapi import security, Security, Depends, HTTPException, status
from service import AuthService
from exception import TokenExpiredError, TokenNotCorrectError
from cache import AsyncRedisManager

def get_auth_service() -> AuthService:
    return AuthService()


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
