from .google_auth import router as google_auth_router
from .auth import router as auth_router
from .google_calendar import router as google_calendar_router
from .webhook import router as webhook_router

routers = [google_auth_router, auth_router, google_calendar_router, webhook_router]
