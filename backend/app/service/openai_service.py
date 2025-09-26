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
        Преобразование событий календаря в упрощенный ��ормат для AI анализа
        """
        simplified_events = []

        def _parse_iso(dt: Optional[str]) -> Optional[datetime]:
            if not dt:
                return None
            try:
                # Приводим Z к формату +00:00, чтобы fromisoformat ��онимал
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
            # Под��отовка сообщений
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
                    # Если модель не поддерживает response_format — повторяем без него
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
        analysis_period_days: int = 7,
        analysis_type: str = 'general'
    ) -> Dict[str, Any]:
        """
        Анализ календаря и целей пользователя для предложения оптимизации

        Args:
            calendar_events: События календаря
            user_goals: SMART цели пользователя
            analysis_period_days: Период анализа в днях
            analysis_type: Тип анализа ('week', 'tomorrow', 'general')

        Returns:
            Анализ и рекомендации от ИИ
        """
        try:
            # Формируем системный промпт в зависимости от типа анализа
            system_prompt = self._get_analysis_system_prompt(analysis_type, analysis_period_days)

            # Формируем пользовательский запрос
            user_message = self._build_analysis_user_message(
                calendar_events, user_goals, analysis_period_days, analysis_type
            )

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.6,
                response_format={"type": "json_object"}
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

    def _get_analysis_system_prompt(self, analysis_type: str, analysis_period_days: int) -> str:
        """Генерирует системный промпт в зависимости от типа анализа"""

        base_prompt = """
        Ты — эксперт по тайм-менеджменту. Проанализируй СУЩЕСТВУЮЩИЙ календарь пользователя и его SMART-цели.
        Твоя задача: найти СВОБОДНЫЕ СЛОТЫ в календаре и предложить оптимальное расписание для достижения целей.

        ВАЖНО: Ты должен:
        1. Проанализировать существующие события в календаре 
        2. Найти свободные временные слоты между этими событиями
        3. Предложить оптимальное использование свободного времени для работы над целями
        4. НЕ КОНФЛИКТОВАТЬ с существующими событиями
        5. Учитывать время на дорогу, перерывы и буферы меж��у встречами

        Правила формата ответа (строго JSON):
        {
          "summary": string,           // Краткий анализ календаря и найденных возможностей
          "free_slots_analysis": {     // НОВОЕ: анализ свободных слотов
            "total_free_hours": number,
            "optimal_slots": Array<{   // Лучшие слоты для работы над целями
              "date": string,          // YYYY-MM-DD
              "start_time": string,    // HH:MM
              "end_time": string,      // HH:MM  
              "duration_hours": number,
              "energy_level": "high" | "medium" | "low",  // Уровень энергии в это время
              "best_for": string       // Какой тип задач лучше всего подходит
            }>
          },
          "recommendations": string[], // Общие рекомендации по планированию
          "schedule_changes": Array<{
            "id"?: string,               
            "action": "create" | "move" | "reschedule" | "optimize",  // Убрал cancel - работаем только со свободными слотами
            "title": string,             
            "reason": string,            // Почему этот слот оптимален для данной задачи
            "new_start": string,         // ISO 8601 - ОБЯЗАТЕЛЬНО для create
            "new_end": string,           // ISO 8601 - ОБЯЗАТЕЛЬНО для create  
            "priority": "high" | "medium" | "low",
            "goal_id"?: string,          // ID связанной цели
            "description"?: string,      // Подробное описание задачи
            "is_new_event": true,        // Всегда true для новых событий в свободных слотах
            "recurrence"?: {             
              "rrule"?: string,          
              "days_of_week"?: string[], 
              "frequency"?: string,      
              "interval"?: number,       
              "until"?: string           
            }
          }>,
          "goal_alignment": string,
          "productivity_score"?: number  // 1..10
        }
        """

        specific_instructions = {
            'tomorrow': """
            СПЕЦИАЛЬНЫЙ ФОКУС: АНАЛИЗ ЗАВТРАШНЕГО ДНЯ
            - Проанализируй ТОЛЬКО события завтрашнего дня из календаря
            - Найди все свободные слоты между существующими встречами/событиями
            - Определи оптимальные временные окна для работы над целями:
              * Утро (8:00-12:00) - высокая энергия, сложные задачи
              * После обеда (14:00-17:00) - средняя энергия, рутинные задачи  
              * Вечером (19:00-21:00) - низкая энергия, планирование, чтение
            - Учитывай время на дорогу между локациями существующих встреч
            - Добавляй буферы 15-30 минут до/после важных встреч
            - НЕ предлагай события, которые пересекаются с существующими
            - Если день перегружен, предложи только самые важные задачи в больших свободных окнах
            """,

            'week': """
            СПЕЦИАЛЬНЫЙ ФОКУС: АНАЛИЗ НЕДЕЛИ  
            - Проанализируй события всех 7 дней недели из календаря
            - Найди паттерны: какие дни более/менее загружены существующими событиями
            - Найди регулярные свободные слоты для работы над долгосрочными целями
            - Предложи оптимальное распределение нагрузки по дням:
              * Понедельник - планирование недели, важные задачи
              * Вторник-четверг - основная работа, встречи, проекты
              * Пятница - завершение задач, подготовка к следующей неделе
              * Выходные - отдых, хобби, личные цели
            - Ищи возможности для создания регулярных блоков времени на цели
            - Балансируй нагрузку - если один день перегружен, используй свободные слоты других дней
            - НЕ конфликтуй с существующими событиями и встречами
            """,

            'general': """
            СПЕЦИАЛЬНЫЙ ФОКУС: ОБЩИЙ АНАЛИЗ КАЛЕНДАРЯ
            - Анализируй общие паттерны использования времени в календаре
            - Ищи хронические проблемы: нехватка буферов, конфликты расписания
            - Оценивай эффективность использования свободного времени
            - Предлагай системные улучшения в планировании
            - Анализируй соответствие текущего расписания долгосрочным целям
            - Ищи возможности для создания регулярных временных блоков
            - НЕ предлагай изменения существующих событий без веской причины
            """
        }

        return base_prompt + specific_instructions.get(analysis_type, specific_instructions['general']) + """
        
        КРИТИЧЕСКИ ВАЖНО - Работа со свободными слотами:
        - АНАЛИЗИРУЙ существующие события календаря для понимания занятого времени
        - НАХОДИ свободные промежутки между существующими событиями
        - ПРЕДЛАГАЙ новые события ТОЛЬКО в свободных слота�
        - УЧИТЫВАЙ время на дорогу между локациями (добавляй 15-30 мин буферы)
        - НЕ ПЕРЕКРЫВАЙ существующие события
        - Если action = "create" — обязательно проверь, что new_start и new_end не конфликтуют с календарем
        - Если свободного времени мало, фокусируйся на самых важных целях
        - Предлагай realistic временные рамки (30 мин - 2 часа на задачу)
        - Группируй связанные задачи в один временной блок для эффективности

        ВАЖНО: Формат времени
        - Используй локальную временную зону 
        - Формат new_start/new_end: полная дата и время в ISO 8601 (например: "2024-12-27T14:00:00")
        - Для многодневных событий указывай полные интервалы с датами
        - Учитывай рабочие часы пользователя (обычно 9:00-18:00 в рабочие дни)
        """

    def _build_analysis_user_message(
        self,
        calendar_events: List[Dict],
        user_goals: List[Dict],
        analysis_period_days: int,
        analysis_type: str
    ) -> str:
        """Создает пользовательское сообщение с учетом типа анализа"""

        period_descriptions = {
            'tomorrow': 'завтрашний день',
            'week': 'ближайшую неделю',
            'general': f'ближайшие {analysis_period_days} дней'
        }

        period_desc = period_descriptions.get(analysis_type, f'ближайшие {analysis_period_days} дней')

        # Преобразуем события календаря для лучшего анализа
        simplified_events = self._convert_calendar_events_for_ai(calendar_events)

        # Добавляем специфичные инструкции для каждого типа анализа
        focus_instructions = {
            'tomorrow': """
            ФОКУС НА ЗАВТРА:
            - Проанализируй СУЩЕСТВУЮЩИЕ события завтрашнего дня
            - Найди все СВОБОДНЫЕ временные промежутки между встречами
            - Предложи конкретные задачи для работы над целями в свободное время
            - Учти в��емя на дорогу, перерывы и буферы между встречами
            - НЕ предлагай события, которые конфликтуют с существующими встречами
            """,
            'week': """
            ФО��УС НА НЕДЕЛЮ:
            - Проанализируй СУЩЕСТВУЮЩИЕ события всех 7 дней недели
            - Найди паттерны загруженности: какие дни свободнее, какие перегружены
            - Найди регулярные свободные слоты для системной работы над целями
            - Предложи оптимальное использование свободного времени на каждый день
            - НЕ конфликтуй с существующими встречами и событиями
            """,
            'general': """
            ОБЩИЙ АНАЛИЗ:
            - Проанализируй общие паттерны использования времени в календаре
            - Найди хронические проблемы в планировании
            - Оцени эффективность использования свободного времени
            - Предложи системные улучшения для достижения целей
            """
        }

        focus_instruction = focus_instructions.get(analysis_type, focus_instructions['general'])

        return f"""
        {focus_instruction}
        
        Проанализируй мой существующий календарь на {period_desc} и найди опт��мальные способы использования свободного времени для достижения моих целей.

        МОИ ЦЕЛИ (нужно найти время для работы над ними):
        {json.dumps(user_goals, ensure_ascii=False, indent=2)}

        СУЩЕСТВУЮЩИЕ СОБЫТИЯ В КАЛЕНДАРЕ (НЕ ИЗМЕНЯЙ ИХ, найди свободное время между ними):
        {json.dumps(simplified_events, ensure_ascii=False, indent=2)}

        ВАЖНО: 
        - Проанализируй существующие события и найди между ними свободные слоты
        - Предложи конкретные задачи для работы над целями в найденном свободном времени
        - НЕ предлагай ��зменения существующих событий без крайней необходимости
        - Фокусируйся на создании новых событий в свободных промежутках
        - Учитывай время на дорогу и перерывы между существующими встречами

        Верни строго JSON по описанной схеме, без дополнительного текста и пояснений.
        """


    async def generate_schedule_suggestion(
        self,
        free_time_slots: List[Dict],
        goal: Dict,
        context: str = ""
    ) -> Dict[str, Any]:
        """
        Генерация предложения по планированию конкретной цели

        Args:
            free_time_slots: Свободн��е временные слоты
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
               - action: ��ип действия (move, reschedule, cancel, optimize)
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

    async def create_full_schedule(
        self,
        schedule_type: str,
        user_goals: List[Dict],
        existing_events: List[Dict] = None,
        work_hours_start: str = "09:00",
        work_hours_end: str = "18:00",
        break_duration_minutes: int = 60,
        buffer_between_events_minutes: int = 15,
        preferences: Dict = None,
        ignore_existing_events: bool = False
    ) -> Dict[str, Any]:
        """
        Создание полного расписания на день или неделю на основе целей пользователя
        
        Args:
            schedule_type: 'tomorrow' или 'week'
            user_goals: Список целей пользователя
            existing_events: Существующие события в календаре
            work_hours_start: Врем�� начала рабочего дня
            work_hours_end: Время окончания рабочего дня
            break_duration_minutes: Длительность обеденного перерыва
            buffer_between_events_minutes: Буфер между событиями
            preferences: Дополнительные предпочтения пользователя
            ignore_existing_events: Полностью игнорировать текущее расписание

        Returns:
            Полное расписание с событиями по дням
        """
        try:
            # Определяем временной период
            from datetime import datetime, timedelta
            import pytz
            
            today = datetime.now()
            
            if schedule_type == "tomorrow":
                start_date = today + timedelta(days=1)
                end_date = start_date
                period_description = "завтрашний день"
                days_count = 1
            elif schedule_type == "week":
                start_date = today + timedelta(days=1)  # начинаем с завтра
                end_date = start_date + timedelta(days=6)  # 7 дней включая завтра
                period_description = "ближайшую неделю"
                days_count = 7
            else:
                raise ValueError(f"Неподдерживаемый тип расписания: {schedule_type}")

            # Уточняем условие про существующие события
            constraints_line = (
                "- Игнорируй полностью существующие события календаря и не проверяй пересечения с ними"
                if ignore_existing_events else
                "- Не планируй на время существующих событий и избегай пересечений"
            )

            # Создаем системный промпт
            system_prompt = f"""
            Ты — экспертный AI-планировщик, специализирующийся на создании оптимальных расписаний на основе целей пользователя и лучших практик тайм-менеджмента.

            ЗАДАЧА: Создать полное расписание на {period_description} ({days_count} дней), которое:
            1. Учитывает все цели пользователя и их приоритеты
            2. Следует лучшим практикам продуктивности (матрица Эйзенхауэра, принцип Парето, etc.)
            3. Включает время на отдых, еду и перерывы
            4. Оптимально распределяет нагрузку по времени дня и дням недели
            5. {'ИГНОРИРУЕТ существующие события' if ignore_existing_events else 'Не конфликтует с существующими событиями'}

            ПРИНЦИПЫ ПЛАНИРОВАНИЯ:
            - Сложные и важные задачи планируй на утро (9:00-12:00) когда энергия максимальна
            - Рутинные задачи и встречи — после обеда (14:00-17:00)
            - Творческие задачи — в периоды высокой энергии (утро или после короткого отдыха)
            - Обязательные перерывы каждые 90-120 минут
            - Обеденный перерыв 60 минут (12:00-13:00 или 13:00-14:00)
            - Буферы {buffer_between_events_minutes} минут между событиями
            - Для недельного планирования: равномерно распредели нагрузку, понедельник и вторник — для сложных задач

            КАТЕГОРИИ СОБЫТИЙ:
            - work: рабочие задачи, проекты
            - learning: обучение, развитие навыков
            - health: спорт, мед��тация, самочувствие
            - personal: личные дела, хобби
            - social: встречи, общение
            - routine: повседневные задачи
            - break: отдых, перерывы

            ОТВЕТ В СТРОГОМ JSON ФОРМАТЕ:
            {{
              "schedule_type": "{schedule_type}",
              "schedules": [
                {{
                  "date": "YYYY-MM-DD",
                  "day_name": "Monday/Tuesday/etc",
                  "events": [
                    {{
                      "title": "string",
                      "description": "string",
                      "start_time": "YYYY-MM-DDTHH:MM:SS+03:00",
                      "end_time": "YYYY-MM-DDTHH:MM:SS+03:00",
                      "priority": "high/medium/low",
                      "category": "work/learning/health/personal/social/routine/break",
                      "goal_id": "string или null",
                      "is_flexible": true/false
                    }}
                  ],
                  "total_productive_hours": number,
                  "break_time_hours": number,
                  "summary": "краткое описание дня"
                }}
              ],
              "recommendations": ["список общих рекомендаций"],
              "total_goals_addressed": number,
              "productivity_score": number (1-10),
              "reasoning": "объяснение принципов планирования"
            }}

            ВАЖНО: 
            - Создавай КОНКРЕТНЫЕ события с точным временем
            - Учитывай рабочие часы: {work_hours_start} - {work_hours_end}
            - Все времена в формате ISO 8601 с timezone
            {constraints_line}
            - Каждая цель должна иметь конкретные временные блоки
            - Балансируй работу и отдых
            """

            # Формируем пользовательское сообщение
            user_message = f"""
            Создай полное расписание на {period_description} на основе моих целей.

            ПЕРИОД ПЛАНИРОВАНИЯ:
            - Начало: {start_date.strftime('%Y-%m-%d')}
            - Конец: {end_date.strftime('%Y-%m-%d')}
            - Количество дней: {days_count}

            МОИ ЦЕЛИ:
            {json.dumps(user_goals, ensure_ascii=False, indent=2)}

            РАБОЧИЕ ЧАСЫ: {work_hours_start} - {work_hours_end}
            ОБЕДЕННЫЙ ПЕРЕРЫВ: {break_duration_minutes} минут
            БУФЕРЫ МЕЖДУ СОБЫТИЯМИ: {buffer_between_events_minutes} минут
            """

            if existing_events and not ignore_existing_events:
                user_message += f"""
                
                СУЩЕСТВУЮЩИЕ СОБЫТИЯ (не планируй на это время):
                {json.dumps(existing_events, ensure_ascii=False, indent=2)}
                """

            if preferences:
                user_message += f"""
                
                ДОПОЛНИТЕЛЬНЫЕ ПРЕДПОЧТЕНИЯ:
                {json.dumps(preferences, ensure_ascii=False, indent=2)}
                """

            if ignore_existing_events:
                user_message += """
                
                ВАЖНО: Игнорируй текущие события календаря. Разрешены пересечения с ними, цель — построить идеальный план исходя ТОЛЬКО из целей.
                """

            user_message += """
            
            Создай оптимальное расписание, которое поможет достичь всех целей с максимальной эффективностью.
            Ответь строго в JSON формате без дополнительного текста.
            """

            messages = [{"role": "user", "content": user_message}]

            response = await self.create_chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.7,
                max_tokens=4000,  # увеличиваем лимит для полного расписания
                response_format={"type": "json_object"}
            )

            ai_response = response["choices"][0]["message"]["content"]
            logger.info(f"AI response for full schedule: {ai_response[:500]}...")

            try:
                schedule_result = json.loads(ai_response)
                
                # Валидация структуры ответа
                if not isinstance(schedule_result.get("schedules"), list):
                    raise ValueError("Поле 'schedules' должно быть массивом")
                
                # Убеждаемся что есть расписание на каждый день
                if len(schedule_result["schedules"]) != days_count:
                    logger.warning(f"Expected {days_count} days, got {len(schedule_result['schedules'])}")
                
                return schedule_result
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse AI schedule response: {e}")
                return {
                    "schedule_type": schedule_type,
                    "schedules": [],
                    "recommendations": ["Не удалось создать расписание. Попробуйте еще раз."],
                    "total_goals_addressed": 0,
                    "productivity_score": 0,
                    "reasoning": f"Ошибка парсинга ответа ИИ: {str(e)}"
                }

        except Exception as e:
            logger.error(f"Error in create_full_schedule: {str(e)}")
            raise Exception(f"Ошибка при создании расписания: {str(e)}")
