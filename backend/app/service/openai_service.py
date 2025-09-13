import aiohttp
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

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

        def _parse_iso(dt: Optional[str]) -> Optional[datetime]:
            if not dt:
                return None
            try:
                # Приводим Z к формату +00:00, чтобы fromisoformat понимал
                if isinstance(dt, str) and dt.endswith('Z'):
                    dt = dt.replace('Z', '+00:00')
                # Если передана только дата (YYYY-MM-DD), считаем полночь
                if isinstance(dt, str) and len(dt) == 10 and dt[4] == '-' and dt[7] == '-':
                    return datetime.fromisoformat(dt + 'T00:00:00+00:00')
                return datetime.fromisoformat(dt)
            except Exception:
                return None

        for event in calendar_events:
            try:
                # Извлекаем время начала и окончания
                start_time = None
                end_time = None
                time_zone = None

                if event.get('start'):
                    if isinstance(event['start'], dict):
                        start_time = event['start'].get('dateTime') or event['start'].get('date')
                        time_zone = event['start'].get('timeZone') or time_zone
                    else:
                        start_time = str(event['start'])

                if event.get('end'):
                    if isinstance(event['end'], dict):
                        end_time = event['end'].get('dateTime') or event['end'].get('date')
                        time_zone = event['end'].get('timeZone') or time_zone
                    else:
                        end_time = str(event['end'])

                # Признаки «весь день» и «многодневность»
                is_all_day = isinstance(start_time, str) and len(start_time) == 10 and start_time.count('-') == 2
                # Если есть оба времени, пробуем посчитать длительность и многодневность
                dt_start = _parse_iso(start_time)
                dt_end = _parse_iso(end_time)
                duration_minutes: Optional[int] = None
                spans_multiple_days = False
                if dt_start and dt_end:
                    delta = dt_end - dt_start
                    # Защита от отрицательной длительности
                    if isinstance(delta, timedelta):
                        duration_minutes = int(delta.total_seconds() // 60)
                        spans_multiple_days = dt_start.date() != dt_end.date() or (duration_minutes is not None and duration_minutes >= 24 * 60)

                # Обрабатываем участников
                attendees = []
                if event.get('attendees'):
                    for attendee in event['attendees']:
                        if isinstance(attendee, dict):
                            attendees.append(attendee.get('email', str(attendee)))
                        elif isinstance(attendee, str):
                            attendees.append(attendee)

                # Упрощенная структура для AI + сигналы о долгих событиях
                simplified_event = {
                    'id': event.get('id', ''),
                    'title': event.get('summary', ''),
                    'description': event.get('description', ''),
                    'start_time': start_time,
                    'end_time': end_time,
                    'time_zone': time_zone,
                    'location': event.get('location', ''),
                    'attendees': attendees,
                    'is_recurring': bool(event.get('recurrence')),
                    'is_all_day': bool(is_all_day),
                    'spans_multiple_days': bool(spans_multiple_days),
                    'duration_minutes': duration_minutes
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
        system_prompt: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Создание чат-завершения через OpenAI API

        Args:
            messages: Список сообщений в формате [{"role": "user", "content": "text"}]
            model: Модель для использования (по умолчанию из settings)
            max_tokens: Максимальное количество токенов
            temperature: Температура генерации
            system_prompt: Системный промпт
            response_format: Принудительный формат ответа (например, {"type": "json_object"})

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
            payload: Dict[str, Any] = {
                "model": model or self.model,
                "messages": chat_messages,
                "max_tokens": max_tokens or self.max_tokens,
                "temperature": temperature or self.temperature
            }
            if response_format:
                payload["response_format"] = response_format

            # Создаем connector для прокси если он настроен
            connector = None
            if settings.PROXY_URL:
                try:
                    from aiohttp_socks import ProxyConnector
                    connector = ProxyConnector.from_url(settings.PROXY_URL)
                except ImportError:
                    logger.warning("aiohttp_socks not installed, proxy will be ignored")

            async with aiohttp.ClientSession(connector=connector) as session:
                async def _post(pld: Dict[str, Any]) -> Dict[str, Any]:
                    async with session.post(
                        f"{self.base_url}/chat/completions",
                        headers=self._get_headers(),
                        json=pld
                    ) as response:
                        data = await response.json()
                        return {"status": response.status, "data": data}

                result = await _post(payload)
                status = result["status"]
                data = result["data"]

                if status != 200:
                    # Е��ли модель не поддерживает response_format — повторяем без него
                    msg = str(data)
                    if response_format and (
                        "response_format" in msg or "Invalid parameter" in msg or "not supported" in msg
                    ):
                        logger.info("Model does not support response_format, retrying without it")
                        payload.pop("response_format", None)
                        result2 = await _post(payload)
                        if result2["status"] != 200:
                            logger.error(f"OpenAI API error: {result2['status']}, {result2['data']}")
                            raise Exception(
                                f"OpenAI API error: {result2['data'].get('error', {}).get('message', 'Unknown error')}"
                            )
                        return result2["data"]

                    logger.error(f"OpenAI API error: {status}, {data}")
                    raise Exception(f"OpenAI API error: {data.get('error', {}).get('message', 'Unknown error')}")

                return data

        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
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
            # Преобразуем события календаря в упрощенный формат для AI
            simplified_events = self._convert_calendar_events_for_ai(calendar_events)

            # Формируем системный промпт для анализа календаря
            system_prompt = """
            Ты — эксперт по тайм-менеджменту и productivity coach с опытом работы с занятыми профессионалами.
            Проанализируй календарь пользователя и его SMART-цели, предложи конкретные, реализуемые изменения.

            ПРИНЦИПЫ АНАЛИЗА:
            1. Фокус на результат: каждое предложение должно напрямую помогать достижению целей
            2. Энергетический менеджмент: учитывай биоритмы (утро = высокая энергия, вечер = низкая)
            3. Защита от перегрузки: не более 70% времени должно быть занято
            4. Время на восстановление: минимум 15 минут между встречами
            5. Правило 2-часов: блоки глубокой работы не менее 2 часов

            ФОРМАТ ОТВЕТА (строго JSON):
            {
              "summary": "краткий анализ текущего состояния календаря (2-3 предложения)",
              "productivity_score": number,  // оценка 1-10 эффективности текущего расписания
              "main_issues": string[],       // 2-3 основные проблемы в планировании
              "recommendations": string[],   // 3-5 общих рекомендаций
              "schedule_changes": [{
                "id"?: string,               // id события для изменения существующего
                "action": "move" | "reschedule" | "cancel" | "create" | "optimize" | "split",
                "title": string,             // что именно делать
                "reason": string,            // зачем это нужно (связь с целями)
                "priority": "high" | "medium" | "low",
                "new_start"?: string,        // ISO 8601 с датой и временем
                "new_end"?: string,          // ISO 8601 с датой и временем
                "estimated_benefit": string, // какой результат ожидается
                "recurrence"?: {
                  "frequency": "daily" | "weekly" | "monthly",
                  "days_of_week"?: string[], // ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
                  "interval"?: number,       // каждые N периодов
                  "until"?: string           // до какой даты ISO 8601
                }
              }],
              "goal_alignment": {
                "current_focus": string,     // на какие цели сейчас тратится больше времени
                "missing_focus": string[],   // какие цели игнорируются
                "recommended_time_allocation": {
                  "goal_id": string,
                  "recommended_hours_per_week": number
                }[]
              },
              "energy_optimization": {
                "high_energy_tasks": string[], // что делать утром (9-12)
                "low_energy_tasks": string[],  // что делать вечером (15-18)
                "deep_work_windows": string[]  // рекомендуемые 2+ часовые блоки
              }
            }

            ТРЕБОВАНИЯ К СОДЕРЖАНИЮ:
            - Все предложения должны иметь конкретные даты и время в ISO 8601
            - Учитывай часовой пояс пользователя из событий календаря
            - Для action="create" обязательны new_start, new_end, title
            - Для action="move"/"reschedule" обязательны new_start, new_end, id
            - Не предлагай изменения, которые создают конфликты с существующими событиями
            - Длинные события (>3 часов, весь день) перемещай осторожно с полным обоснованием
            - Учитывай дни недели: рабочие/выходные дни имеют разную логику планирования

            ОСОБЕННОСТИ РАБОТЫ С ЦЕЛЯМИ:
            - Каждое изменение должно четко связываться с конкретной целью
            - Приоритизируй цели с ближайшими дедлайнами
            - Для долгосрочных целей создавай регулярные блоки времени
            - Учитывай сложность цели при планировании времени

            ОТВЕЧАЙ НА РУССКОМ ЯЗЫКЕ!
            """

            # Формируем пользовательский запрос
            user_message = f"""
            Проанализируй мой календарь на ближайшие {analysis_period_days} дней и помоги оптимизировать его для достижения моих целей.

            МОИ SMART-ЦЕЛИ:
            {json.dumps(user_goals, ensure_ascii=False, indent=2)}

            МОЙ КАЛЕНДАРЬ:
            {json.dumps(simplified_events, ensure_ascii=False, indent=2)}

            ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:
            - Период анализа: {analysis_period_days} дней
            - Количество событий: {len(simplified_events)}
            - Количество целей: {len(user_goals)}

            Верни строго JSON по описанной схеме, без дополнительных пояснений.
            """

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.4,  # Более низкая температура для точности
                max_tokens=12000,  # Увеличиваем для подробного анализа
                response_format={"type": "json_object"}
            )

            # Извлекаем содержимое ответа
            ai_response = response["choices"][0]["message"]["content"]

            try:
                # Пытаемся распарсить JSON ответ
                parsed_response = json.loads(ai_response)

                # Валидируем и дополняем ответ если нужно
                if "productivity_score" not in parsed_response:
                    parsed_response["productivity_score"] = 5
                if "schedule_changes" not in parsed_response:
                    parsed_response["schedule_changes"] = []
                if "goal_alignment" not in parsed_response:
                    parsed_response["goal_alignment"] = {
                        "current_focus": "Не определено",
                        "missing_focus": [],
                        "recommended_time_allocation": []
                    }

                return parsed_response
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse AI response as JSON: {e}")
                # Если не удалось распарсить JSON, возвращаем базовую структуру
                return {
                    "summary": "Анализ выполнен, но возникли проблемы с форматированием ответа",
                    "productivity_score": 5,
                    "main_issues": ["Не удалось определить основные проблемы"],
                    "recommendations": ["Попробуйте повторить анализ"],
                    "schedule_changes": [],
                    "goal_alignment": {
                        "current_focus": "Не определено",
                        "missing_focus": [],
                        "recommended_time_allocation": []
                    },
                    "energy_optimization": {
                        "high_energy_tasks": [],
                        "low_energy_tasks": [],
                        "deep_work_windows": []
                    },
                    "raw_response": ai_response  # Сохраняем оригинальный ответ для отладки
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
            Ты — персональный планировщик. Дай конкретный план без абстракций.

            Ответ в строгом JSON:
            {
              "suggested_time": string,   // ISO 8601 интервал или описательный слот
              "duration": string,         // например, "60m"
              "frequency": string,        // например, "3 раза в неделю"
              "reasoning": string,
              "suggested_events"?: Array<{
                 "title": string,
                 "description": string,
                 "start_time": string,   // ISO 8601
                 "end_time": string,     // ISO 8601
                 "priority": number
              }>
            }

            Учитывай энергию, баланс работы и отдыха. Не давай расплывчатых советов.
            """

            user_message = f"""
            Помоги запланировать работу над целью в свободное время.

            ЦЕЛЬ:
            {json.dumps(goal, ensure_ascii=False, indent=2)}

            СВОБОДНЫЕ СЛОТЫ:
            {json.dumps(free_time_slots, ensure_ascii=False, indent=2)}

            КОНТЕКСТ:
            {context}

            Верни строго JSON по описанной схеме, без лишнего текста.
            """

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.6,
                response_format={"type": "json_object"}
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

            user_message = f"""
            Проанализируй мой календарь:

            События календаря:
            {json.dumps(calendar_events, ensure_ascii=False, indent=2)}
            """

            if goals:
                user_message += f"\n\nМои цели: {', '.join(goals)}"

            if context:
                user_message += f"\n\nДополнительный контекст: {context}"

            messages = [
                {"role": "user", "content": user_message}
            ]

            ai_response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                response_format={"type": "json_object"}
            )

            content = ai_response["choices"][0]["message"]["content"]
            analysis_result = json.loads(content)

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

    async def analyze_goal_smart(self, title: str, description: str, deadline: Optional[str] = None) -> Dict[str, Any]:
        """
        Анализ цели по критериям SMART
        
        Args:
            title: Название цели
            description: Описание цели
            deadline: Дедлайн цели (опционально)
            
        Returns:
            Результат SMART анализа
        """
        try:
            system_prompt = """Ты эксперт по постановке целей и методологии SMART. 
            Проанализируй предоставленную цель по критериям SMART (Specific, Measurable, Achievable, Relevant, Time-bound).
            
            Ответь СТРОГО в JSON формате:
            {
                "is_smart": boolean,
                "overall_score": number (0-100),
                "analysis": {
                    "specific": {"score": number (0-100), "feedback": "string"},
                    "measurable": {"score": number (0-100), "feedback": "string"},
                    "achievable": {"score": number (0-100), "feedback": "string"},
                    "relevant": {"score": number (0-100), "feedback": "string"},
                    "time_bound": {"score": number (0-100), "feedback": "string"}
                },
                "suggestions": ["string", "string", ...],
                "improved_goal": {
                    "title": "string",
                    "description": "string"
                }
            }"""

            user_message = f"""Цель для анализа:
            Название: {title}
            Описание: {description}"""
            
            if deadline:
                user_message += f"\nДедлайн: {deadline}"

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                response_format={"type": "json_object"},
                temperature=0.3
            )

            content = response["choices"][0]["message"]["content"]
            return json.loads(content)

        except Exception as e:
            logger.error(f"Error analyzing SMART goal: {e}")
            # Возвращаем базовый анализ в случае ошибки
            return {
                "is_smart": False,
                "overall_score": 50,
                "analysis": {
                    "specific": {"score": 50, "feedback": "Не удалось проанализировать"},
                    "measurable": {"score": 50, "feedback": "Не удалось проанализировать"},
                    "achievable": {"score": 50, "feedback": "Не удалось проанализировать"},
                    "relevant": {"score": 50, "feedback": "Не удалось проанализировать"},
                    "time_bound": {"score": 50, "feedback": "Не удалось проанализировать"}
                },
                "suggestions": ["Уточните цель более детально"],
                "improved_goal": {
                    "title": title,
                    "description": description
                }
            }
