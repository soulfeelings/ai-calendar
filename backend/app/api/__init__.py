from .google_auth import router as google_auth_router
from .auth import router as auth_router

routers = [google_auth_router, auth_router]