import aiohttp
import json
from typing import Dict, List, Optional, Any
from datetime import datetime

from settings import settings
import logging

logger = logging.getLogger(__name__)


class OpenAIService:
    """Сервис для работы с OpenAI API через HTTP-запросы"""

    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.base_url = "https://api.openai.com/v1"
        self.model = settings.OPENAI_MODEL
        self.max_tokens = settings.OPENAI_MAX_TOKENS
        self.temperature = settings.OPENAI_TEMPERATURE

    def _get_headers(self) -> Dict[str, str]:
        """Получение заголовков для запроса к OpenAI API"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def _convert_calendar_events_for_ai(self, calendar_events: List[Dict]) -> List[Dict]:
        """
        Преобразование событий календаря в упрощенный формат для AI анализа
        """
        simplified_events = []

        for event in calendar_events:
            try:
                # Извлекаем время начала и окончания
                start_time = None
                end_time = None

                if event.get('start'):
                    if isinstance(event['start'], dict):
                        start_time = event['start'].get('dateTime') or event['start'].get('date')
                    else:
                        start_time = str(event['start'])

                if event.get('end'):
                    if isinstance(event['end'], dict):
                        end_time = event['end'].get('dateTime') or event['end'].get('date')
                    else:
                        end_time = str(event['end'])

                # Обрабатываем участников
                attendees = []
                if event.get('attendees'):
                    for attendee in event['attendees']:
                        if isinstance(attendee, dict):
                            attendees.append(attendee.get('email', str(attendee)))
                        elif isinstance(attendee, str):
                            attendees.append(attendee)

                # Упрощенная структура для AI
                simplified_event = {
                    'id': event.get('id', ''),
                    'title': event.get('summary', ''),
                    'description': event.get('description', ''),
                    'start_time': start_time,
                    'end_time': end_time,
                    'location': event.get('location', ''),
                    'attendees': attendees,
                    'is_recurring': bool(event.get('recurrence'))
                }

                simplified_events.append(simplified_event)

            except Exception as e:
                logger.warning(f"Error converting event {event.get('id', 'unknown')}: {e}")
                continue

        return simplified_events

    async def create_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Создание чат-завершения через OpenAI API

        Args:
            messages: Список сообщений в формате [{"role": "user", "content": "text"}]
            model: Модель для использования (по умолчанию из settings)
            max_tokens: Максимальное количество токенов
            temperature: Температура генерации
            system_prompt: Системный промпт

        Returns:
            Ответ от OpenAI API
        """
        try:
            # Подготовка сообщений
            chat_messages = []

            # Добавляем системный промпт если указан
            if system_prompt:
                chat_messages.append({
                    "role": "system",
                    "content": system_prompt
                })

            # Добавляем пользовательские сообщения
            chat_messages.extend(messages)

            # Подготовка данных запроса
            payload = {
                "model": model or self.model,
                "messages": chat_messages,
                "max_tokens": max_tokens or self.max_tokens,
                "temperature": temperature or self.temperature
            }

            # Создаем connector для прокси если он настроен
            connector = None
            if settings.PROXY_URL:
                try:
                    from aiohttp_socks import ProxyConnector
                    connector = ProxyConnector.from_url(settings.PROXY_URL)
                except ImportError:
                    logger.warning("aiohttp_socks not installed, proxy will be ignored")

            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload
                ) as response:
                    response_data = await response.json()

                    if response.status != 200:
                        logger.error(f"OpenAI API error: {response.status}, {response_data}")
                        raise Exception(f"OpenAI API error: {response_data.get('error', {}).get('message', 'Unknown error')}")

                    return response_data

        except Exception as e:
            logger.error(f"Error in create_chat_completion: {str(e)}")
            raise

    async def analyze_calendar_and_goals(
        self,
        calendar_events: List[Dict],
        user_goals: List[Dict],
        analysis_period_days: int = 7
    ) -> Dict[str, Any]:
        """
        Анализ календаря и целей пользователя для предложения оптимизации

        Args:
            calendar_events: События календаря
            user_goals: SMART цели пользователя
            analysis_period_days: Период анализа в днях

        Returns:
            Анализ и рекомендации от ИИ
        """
        try:
            # Формируем системный промпт для анализа календаря
            system_prompt = """
            Ты - эксперт по тайм-менеджменту и планированию. Твоя задача - анализировать календарь пользователя 
            и его SMART цели, чтобы предложить оптимизацию расписания.
            
            Учитывай следующие принципы:
            1. Важность работы с приоритетами (матрица Эйзенхауэра)
            2. Принцип временных блоков для фокусной работы
            3. Необходимость отдыха и восстановления
            4. Соответствие активностей энергетическим циклам
            5. Прогресс к достижению целей
            
            Отвечай в формате JSON с полями:
            - analysis: общий анализ текущего расписания
            - recommendations: список конкретных рекомендаций
            - schedule_changes: предлагаемые изменения в календаре
            - goal_alignment: оценка соответствия расписания целям
            """

            # Формируем пользовательский запрос
            user_message = f"""
            Проанализируй мой календарь на ближайшие {analysis_period_days} дней и мои цели.
            
            МОИ ЦЕЛИ:
            {json.dumps(user_goals, ensure_ascii=False, indent=2)}
            
            МОЙ КАЛЕНДАРЬ:
            {json.dumps(calendar_events, ensure_ascii=False, indent=2)}
            
            Предложи конкретные изменения для оптимизации времени и достижения целей.
            """

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.7
            )

            # Извлекаем содержимое ответа
            ai_response = response["choices"][0]["message"]["content"]

            try:
                # Пытаемся распарсить JSON ответ
                parsed_response = json.loads(ai_response)
                return parsed_response
            except json.JSONDecodeError:
                # Если не удалось распарсить JSON, возвращаем текстовый ответ
                return {
                    "analysis": ai_response,
                    "recommendations": [],
                    "schedule_changes": [],
                    "goal_alignment": "Не удалось определить"
                }

        except Exception as e:
            logger.error(f"Error in analyze_calendar_and_goals: {str(e)}")
            raise

    async def generate_schedule_suggestion(
        self,
        free_time_slots: List[Dict],
        goal: Dict,
        context: str = ""
    ) -> Dict[str, Any]:
        """
        Генерация предложения по планированию конкретной цели

        Args:
            free_time_slots: Свободные временные слоты
            goal: Конкретная SMART цель
            context: Дополнительный контекст

        Returns:
            Предложение по планированию
        """
        try:
            system_prompt = """
            Ты - персональный планировщик. Помоги разместить активность для достижения цели 
            в оптимальные временные слоты.
            
            Учитывай:
            - Тип задачи и требуемую энергию
            - Оптимальное время дня для разных видов деятельности
            - Продолжительность и частоту выполнения
            - Баланс работы и отдыха
            
            Отвечай в формате JSON с полями:
            - suggested_time: рекомендуемое время
            - duration: продолжительность
            - frequency: частота повторения
            - reasoning: обоснование выбора
            """

            user_message = f"""
            Помоги запланировать работу над целью в свободное время.
            
            ЦЕЛЬ:
            {json.dumps(goal, ensure_ascii=False, indent=2)}
            
            СВОБОДНЫЕ СЛОТЫ:
            {json.dumps(free_time_slots, ensure_ascii=False, indent=2)}
            
            КОНТЕКСТ:
            {context}
            
            Предложи оптимальное время для работы над этой целью.
            """

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.6
            )

            ai_response = response["choices"][0]["message"]["content"]

            try:
                return json.loads(ai_response)
            except json.JSONDecodeError:
                return {
                    "suggested_time": "Не определено",
                    "duration": "Не определено",
                    "frequency": "Не определено",
                    "reasoning": ai_response
                }

        except Exception as e:
            logger.error(f"Error in generate_schedule_suggestion: {str(e)}")
            raise

    async def analyze_calendar_events(
        self,
        calendar_events: List[Dict],
        goals: List[str] = None,
        context: str = None
    ) -> Dict[str, Any]:
        """
        Анализ событий календаря с помощью OpenAI
        """
        try:
            # Формируем системный промпт
            system_prompt = """
            Ты - экспертный ИИ-ассистент по тайм-менеджменту и планированию.
            Проанализируй календарь пользователя и предоставь:
            1. Краткое резюме (summary)
            2. Конкретные изменения в расписании (schedule_changes) - массив объектов с полями:
               - id: идентификатор события
               - action: тип действия (move, reschedule, cancel, optimize)
               - title: название изменения
               - reason: причина изменения
               - new_start: новое время начала (если применимо)
               - new_end: новое время окончания (если применимо)
               - priority: приоритет (high, medium, low)
            3. Общие рекомендации (recommendations) - массив строк
            4. Оценку продуктивности (productivity_score) от 1 до 10
            5. Соответствие целям (goal_alignment)

            Отвечай строго в JSON формате.
            """

            # Формируем пользовательский запрос
            user_message = f"""
            Проанализируй мой календарь:

            События календаря:
            {json.dumps(calendar_events, ensure_ascii=False, indent=2)}
            """

            if goals:
                user_message += f"\n\nМои цели: {', '.join(goals)}"

            if context:
                user_message += f"\n\nДополнительный контекст: {context}"

            # Запрос к OpenAI
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "response_format": {"type": "json_object"}
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._get_headers(),
                    json=payload
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"OpenAI API error: {error_text}")

                    result = await response.json()
                    content = result["choices"][0]["message"]["content"]

                    # Парсим JSON ответ
                    analysis_result = json.loads(content)

                    # Обеспечиваем правильную структуру ответа
                    return {
                        "summary": analysis_result.get("summary", "Анализ календаря завершен"),
                        "schedule_changes": analysis_result.get("schedule_changes", []),
                        "recommendations": analysis_result.get("recommendations", []),
                        "productivity_score": analysis_result.get("productivity_score"),
                        "goal_alignment": analysis_result.get("goal_alignment", "Не определено")
                    }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI JSON response: {e}")
            return {
                "summary": "Ошибка при разборе ответа ИИ",
                "schedule_changes": [],
                "recommendations": ["Попробуйте повторить анализ"],
                "productivity_score": None,
                "goal_alignment": "Не удалось определить"
            }
        except Exception as e:
            logger.error(f"Error in OpenAI calendar analysis: {e}")
            raise Exception(f"Ошибка при анализе календаря: {str(e)}")


# Создаем экземпляр сервиса
openai_service = OpenAIService()
