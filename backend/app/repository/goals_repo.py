from database import mongodb
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from schemas.openai_schemas import SMARTGoal

class GoalsRepository:
    """Репозиторий для работы с SMART целями в MongoDB"""

    async def create_goal(self, user_id: str, goal_data: dict) -> str:
        """Создание новой SMART цели"""
        deadline_raw = goal_data.get("deadline")
        deadline_dt = None
        if deadline_raw:
            try:
                # Поддержка ISO строк с суффиксом Z
                deadline_dt = datetime.fromisoformat(str(deadline_raw).replace('Z', '+00:00'))
            except Exception:
                deadline_dt = None
        goal_doc = {
            "user_id": user_id,
            "title": goal_data["title"],
            "description": goal_data.get("description"),
            "deadline": deadline_dt,
            "priority": goal_data.get("priority", "medium"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "status": "active",
            "is_completed": False,
            "smart_analysis": goal_data.get("smart_analysis")  # Результат анализа ИИ
        }

        result = await mongodb.smart_goals.insert_one(goal_doc)
        return str(result.inserted_id)

    async def get_user_goals(self, user_id: str, include_completed: bool = False, only_actual: bool = False) -> List[dict]:
        """Получение целей пользователя с опциональной фильтрацией по актуальности"""
        query = {"user_id": user_id}
        if not include_completed:
            query["is_completed"] = False
        cursor = mongodb.smart_goals.find(query).sort("priority", -1)
        goals = []
        now = datetime.utcnow()
        async for goal_doc in cursor:
            # Фильтрация просроченных целей (deadline < now) если only_actual
            if only_actual:
                deadline_val = goal_doc.get("deadline")
                if deadline_val:
                    try:
                        # Если хранится строка, пытаемся преобразовать
                        if isinstance(deadline_val, str):
                            deadline_dt = datetime.fromisoformat(deadline_val.replace('Z', '+00:00'))
                        else:
                            deadline_dt = deadline_val
                        if deadline_dt < now:
                            continue
                    except Exception:
                        # При ошибке парсинга считаем неактуальной и пропускаем
                        continue
            goal_doc["id"] = str(goal_doc["_id"])
            del goal_doc["_id"]
            goals.append(goal_doc)
        return goals

    async def get_goal_by_id(self, user_id: str, goal_id: str) -> Optional[dict]:
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

    async def update_goal(self, user_id: str, goal_id: str, update_data: dict) -> bool:
        """Обновление цели"""
        try:
            update_data["updated_at"] = datetime.utcnow()
            if "deadline" in update_data:
                deadline_raw = update_data.get("deadline")
                if deadline_raw:
                    try:
                        update_data["deadline"] = datetime.fromisoformat(str(deadline_raw).replace('Z', '+00:00'))
                    except Exception:
                        update_data["deadline"] = None
            result = await mongodb.smart_goals.update_one(
                {"_id": ObjectId(goal_id), "user_id": user_id},
                {"$set": update_data}
            )

            return result.modified_count > 0
        except Exception:
            return False

    async def delete_goal(self, user_id: str, goal_id: str) -> bool:
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
            "completed_at": datetime.utcnow()
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
