// Утилита для парсинга RRULE правил Google Calendar
export interface RecurrenceInfo {
  isRecurring: boolean;
  type: string;
  frequency: string;
  icon: string;
  description: string;
  days?: string[];
  interval?: number;
  count?: number;
  until?: Date;
  weekStart?: string;
  bySetPos?: number[];
  byMonth?: number[];
  byMonthDay?: number[];
  byYearDay?: number[];
  byWeekNo?: number[];
  byHour?: number[];
  byMinute?: number[];
  bySecond?: number[];
}

export class RRuleParser {
  private static readonly DAY_MAP: { [key: string]: string } = {
    'MO': 'Пн',
    'TU': 'Вт',
    'WE': 'Ср',
    'TH': 'Чт',
    'FR': 'Пт',
    'SA': 'Сб',
    'SU': 'Вс'
  };

  private static readonly DAY_MAP_FULL: { [key: string]: string } = {
    'MO': 'понедельник',
    'TU': 'вторник',
    'WE': 'среда',
    'TH': 'четверг',
    'FR': 'пятница',
    'SA': 'суббота',
    'SU': 'воскресенье'
  };

  private static readonly MONTH_MAP: { [key: number]: string } = {
    1: 'январь', 2: 'февраль', 3: 'март', 4: 'апрель',
    5: 'май', 6: 'июнь', 7: 'июль', 8: 'август',
    9: 'сентябрь', 10: 'октябрь', 11: 'ноябрь', 12: 'декабрь'
  };

  static parseRRule(rrule: string): RecurrenceInfo {
    if (!rrule || !rrule.startsWith('RRULE:')) {
      return {
        isRecurring: false,
        type: 'single',
        frequency: '',
        icon: '',
        description: ''
      };
    }

    // Убираем префикс RRULE: и парсим параметры
    const ruleString = rrule.replace('RRULE:', '');
    const params = this.parseRRuleParams(ruleString);

    const freq = params.FREQ;
    const interval = parseInt(params.INTERVAL || '1');
    const byDay = params.BYDAY;
    const count = params.COUNT ? parseInt(params.COUNT) : undefined;
    const until = params.UNTIL ? this.parseUntilDate(params.UNTIL) : undefined;
    const weekStart = params.WKST;

    switch (freq) {
      case 'DAILY':
        return this.parseDailyRule(params, interval, count, until);
      case 'WEEKLY':
        return this.parseWeeklyRule(params, interval, byDay, count, until, weekStart);
      case 'MONTHLY':
        return this.parseMonthlyRule(params, interval, count, until);
      case 'YEARLY':
        return this.parseYearlyRule(params, interval, count, until);
      default:
        return {
          isRecurring: true,
          type: 'custom',
          frequency: 'Расписание',
          icon: '⚙️',
          description: 'Пользовательское расписание повторения'
        };
    }
  }

  private static parseRRuleParams(ruleString: string): { [key: string]: string } {
    const params: { [key: string]: string } = {};
    const parts = ruleString.split(';');

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        params[key.trim()] = value.trim();
      }
    }

    return params;
  }

  private static parseUntilDate(until: string): Date {
    // UNTIL может быть в формате YYYYMMDD или YYYYMMDDTHHMMSSZ
    if (until.includes('T')) {
      // Формат с временем
      return new Date(until.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z'));
    } else {
      // Только дата
      return new Date(until.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
    }
  }

  private static parseDays(byDay: string): string[] {
    if (!byDay) return [];

    return byDay.split(',').map(day => {
      // Убираем числовые префиксы типа 1MO, -1FR
      const cleanDay = day.replace(/^-?\d+/, '');
      return this.DAY_MAP[cleanDay];
    }).filter(Boolean);
  }

  private static parseDailyRule(params: any, interval: number, count?: number, until?: Date): RecurrenceInfo {
    const byDay = params.BYDAY;
    const days = this.parseDays(byDay);

    let frequency = '';
    let description = '';

    if (interval === 1) {
      if (days.length === 0) {
        frequency = 'Каждый день';
        description = 'Повторяется ежедневно';
      } else if (days.length === 5 && !days.includes('Сб') && !days.includes('Вс')) {
        frequency = 'По будням';
        description = 'Повторяется по будням (Пн-Пт)';
      } else if (days.length === 2 && days.includes('Сб') && days.includes('Вс')) {
        frequency = 'По выходным';
        description = 'Повторяется по выходным (Сб-Вс)';
      } else {
        frequency = 'По дням';
        description = `Повторяется в: ${days.join(', ')}`;
      }
    } else {
      frequency = `Каждые ${interval} дня`;
      description = `Повторяется каждые ${interval} дня`;
      if (days.length > 0) {
        description += ` в: ${days.join(', ')}`;
      }
    }

    if (count) {
      description += ` (${count} раз)`;
    } else if (until) {
      description += ` (до ${until.toLocaleDateString('ru-RU')})`;
    }

    return {
      isRecurring: true,
      type: 'daily',
      frequency,
      icon: '📅',
      description,
      days,
      interval,
      count,
      until
    };
  }

  private static parseWeeklyRule(params: any, interval: number, byDay?: string, count?: number, until?: Date, weekStart?: string): RecurrenceInfo {
    const days = this.parseDays(byDay || '');

    let frequency = '';
    let description = '';

    if (interval === 1) {
      if (days.length === 0) {
        frequency = 'Еженедельно';
        description = 'Повторяется еженедельно';
      } else if (days.length === 1) {
        frequency = days[0];
        description = `Повторяется каждый ${this.DAY_MAP_FULL[this.getKeyByValue(this.DAY_MAP, days[0])]}`;
      } else if (days.length === 7) {
        frequency = 'Каждый день';
        description = 'Повторяется каждый день недели';
      } else if (days.length === 5 && !days.includes('Сб') && !days.includes('Вс')) {
        frequency = 'Будни';
        description = 'Повторяется по будням (Пн-Пт)';
      } else if (days.length === 2 && days.includes('Сб') && days.includes('Вс')) {
        frequency = 'Выходные';
        description = 'Повторяется по выходным (Сб-Вс)';
      } else {
        // Всегда показываем конкретные дни
        frequency = days.join(',');
        description = `Повторяется по: ${days.join(', ')}`;
      }
    } else {
      frequency = `Каждые ${interval} нед`;
      description = `Повторяется каждые ${interval} недели`;
      if (days.length > 0) {
        description += ` по: ${days.join(', ')}`;
      }
    }

    if (weekStart) {
      description += ` (неделя начинается с ${this.DAY_MAP_FULL[weekStart]})`;
    }

    if (count) {
      description += ` (${count} раз)`;
    } else if (until) {
      description += ` (до ${until.toLocaleDateString('ru-RU')})`;
    }

    return {
      isRecurring: true,
      type: 'weekly',
      frequency,
      icon: '📆',
      description,
      days,
      interval,
      count,
      until,
      weekStart
    };
  }

  private static parseMonthlyRule(params: any, interval: number, count?: number, until?: Date): RecurrenceInfo {
    const byDay = params.BYDAY;
    const byMonthDay = params.BYMONTHDAY;
    const bySetPos = params.BYSETPOS;

    let frequency = '';
    let description = '';

    if (interval === 1) {
      frequency = 'Ежемесячно';
      description = 'Повторяется ежемесячно';
    } else {
      frequency = `Каждые ${interval} мес`;
      description = `Повторяется каждые ${interval} месяца`;
    }

    if (byMonthDay) {
      description += ` ${byMonthDay}-го числа`;
    } else if (byDay && bySetPos) {
      const days = this.parseDays(byDay);
      const pos = parseInt(bySetPos);
      const posText = pos === 1 ? 'первый' : pos === 2 ? 'второй' : pos === 3 ? 'третий' : pos === 4 ? 'четвертый' : pos === -1 ? 'последний' : `${pos}-й`;
      description += ` в ${posText} ${days[0]?.toLowerCase() || 'день'} месяца`;
    } else if (byDay) {
      const days = this.parseDays(byDay);
      description += ` по: ${days.join(', ')}`;
    }

    if (count) {
      description += ` (${count} раз)`;
    } else if (until) {
      description += ` (до ${until.toLocaleDateString('ru-RU')})`;
    }

    return {
      isRecurring: true,
      type: 'monthly',
      frequency,
      icon: '🗓️',
      description,
      days: byDay ? this.parseDays(byDay) : undefined,
      interval,
      count,
      until
    };
  }

  private static parseYearlyRule(params: any, interval: number, count?: number, until?: Date): RecurrenceInfo {
    const byMonth = params.BYMONTH;
    const byMonthDay = params.BYMONTHDAY;

    let frequency = '';
    let description = '';

    if (interval === 1) {
      frequency = 'Ежегодно';
      description = 'Повторяется ежегодно';
    } else {
      frequency = `Каждые ${interval} лет`;
      description = `Повторяется каждые ${interval} лет`;
    }

    if (byMonth && byMonthDay) {
      const month = this.MONTH_MAP[parseInt(byMonth)];
      description += ` ${byMonthDay} ${month}`;
    } else if (byMonth) {
      const month = this.MONTH_MAP[parseInt(byMonth)];
      description += ` в ${month}`;
    }

    if (count) {
      description += ` (${count} раз)`;
    } else if (until) {
      description += ` (до ${until.toLocaleDateString('ru-RU')})`;
    }

    return {
      isRecurring: true,
      type: 'yearly',
      frequency,
      icon: '📊',
      description,
      interval,
      count,
      until
    };
  }

  private static getKeyByValue(object: { [key: string]: string }, value: string): string {
    return Object.keys(object).find(key => object[key] === value) || '';
  }

  // Дополнительная функция для анализа экземпляров повторяющихся событий
  static analyzeRecurringInstance(event: any): RecurrenceInfo {
    if (event.recurringEventId) {
      return {
        isRecurring: true,
        type: 'instance',
        frequency: 'Экземпляр',
        icon: '🔁',
        description: 'Экземпляр повторяющегося события'
      };
    }

    return {
      isRecurring: false,
      type: 'single',
      frequency: '',
      icon: '',
      description: ''
    };
  }
}
