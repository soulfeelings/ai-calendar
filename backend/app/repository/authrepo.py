from database import mongodb

class AuthRepo:
    async def get_info_from_sub(self, sub):
        user_info = await mongodb.users.find_one({"user_sub": sub})
        if not user_info:
            raise ValueError("Неправильное id или не зарегистрирован")

        return {
            "email": user_info["user_data"]["email"],
            "name": user_info["user_data"]["name"],
            "picture": user_info["user_data"]["picture"],
            }
