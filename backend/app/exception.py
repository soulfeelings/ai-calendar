class TokenExpiredError(Exception):
    detail = 'Token expired'


class TokenNotCorrectError(Exception):
    detail = 'Token not correct'

class RefreshTokenExpiredError(Exception):
    detail = 'Refresh token expired'