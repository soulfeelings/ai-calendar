class TokenExpiredError(Exception):
    detail = 'Token expired'


class TokenNotCorrectError(Exception):
    detail = 'Token not correct'

class RefreshTokenExpiredError(Exception):
    detail = 'Refresh token expired'

class RevokedError(Exception):
    detail = 'You are already logout. Please login again'

