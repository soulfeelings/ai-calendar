from database import mongodb
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from schemas.openai_schemas import SMARTGoal

class GoalsRepository:
    """Репозиторий для работы с SMART целями в MongoDB"""

    async def create_goal(self, user_id: str, goal_data: dict) -> str:
        """Создание новой SMART цели"""
        goal_doc = {
            "user_id": user_id,
            "title": goal_data["title"],
            "description": goal_data.get("description"),
            "deadline": goal_data.get("deadline"),
            "priority": goal_data.get("priority", "medium"),
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "status": "active",
            "smart_analysis": goal_data.get("smart_analysis")  # Результат анализа ИИ
        }

        result = await mongodb.smart_goals.insert_one(goal_doc)
        return str(result.inserted_id)

    async def get_user_goals(self, user_id: str, include_completed: bool = False) -> List[dict]:
        """Получение всех целей пользователя"""
        query = {"user_id": user_id}
        if not include_completed:
            query["is_completed"] = False

        cursor = mongodb.smart_goals.find(query).sort("priority", -1)
        goals = []

        async for goal_doc in cursor:
            goal_doc["id"] = str(goal_doc["_id"])
            del goal_doc["_id"]
            goals.append(goal_doc)

        return goals

    async def get_goal_by_id(self, goal_id: str, user_id: str) -> Optional[dict]:
        """Получение цели по ID"""
        try:
            goal_doc = await mongodb.smart_goals.find_one({
                "_id": ObjectId(goal_id),
                "user_id": user_id
            })

            if goal_doc:
                goal_doc["id"] = str(goal_doc["_id"])
                del goal_doc["_id"]
                return goal_doc

            return None
        except Exception:
            return None

    async def update_goal(self, goal_id: str, user_id: str, update_data: dict) -> bool:
        """Обновление цели"""
        try:
            update_data["updated_at"] = datetime.now()

            result = await mongodb.smart_goals.update_one(
                {"_id": ObjectId(goal_id), "user_id": user_id},
                {"$set": update_data}
            )

            return result.modified_count > 0
        except Exception:
            return False

    async def delete_goal(self, goal_id: str, user_id: str) -> bool:
        """Удаление цели"""
        try:
            result = await mongodb.smart_goals.delete_one({
                "_id": ObjectId(goal_id),
                "user_id": user_id
            })

            return result.deleted_count > 0
        except Exception:
            return False

    async def mark_goal_completed(self, goal_id: str, user_id: str) -> bool:
        """Отметка цели как выполненной"""
        return await self.update_goal(goal_id, user_id, {
            "is_completed": True,
            "completed_at": datetime.now()
        })

    async def get_goals_by_priority(self, user_id: str, priority: int) -> List[dict]:
        """Получение целей по приоритету"""
        cursor = mongodb.smart_goals.find({
            "user_id": user_id,
            "priority": priority,
            "is_completed": False
        }).sort("created_at", -1)

        goals = []
        async for goal_doc in cursor:
            goal_doc["id"] = str(goal_doc["_id"])
            del goal_doc["_id"]
            goals.append(goal_doc)

        return goals
