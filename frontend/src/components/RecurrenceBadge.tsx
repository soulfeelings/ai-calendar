import React from 'react';
import { RRuleParser, RecurrenceInfo } from '../utils/rruleParser';
import './RecurrenceBadge.css';

interface RecurrenceBadgeProps {
  event: {
    recurrence?: string[];
    recurringEventId?: string;
  };
  showFullDescription?: boolean;
}

export const RecurrenceBadge: React.FC<RecurrenceBadgeProps> = ({
  event,
  showFullDescription = false
}) => {
  const getRecurrenceInfo = (): RecurrenceInfo => {
    // Проверяем, является ли событие экземпляром повторяющегося события
    if (event.recurringEventId) {
      return RRuleParser.analyzeRecurringInstance(event);
    }

    // Проверяем, есть ли правила повторения
    if (!event.recurrence || event.recurrence.length === 0) {
      return {
        isRecurring: false,
        type: 'single',
        frequency: '',
        icon: '',
        description: ''
      };
    }

    // Парсим первое правило RRULE
    return RRuleParser.parseRRule(event.recurrence[0]);
  };

  const recurrenceInfo = getRecurrenceInfo();

  if (!recurrenceInfo.isRecurring) {
    return null;
  }

  return (
    <div className={`recurrence-badge recurrence-${recurrenceInfo.type}`}>
      <span
        className="recurrence-content"
        title={recurrenceInfo.description}
      >
        <span className="recurrence-icon">{recurrenceInfo.icon}</span>
        <span className="recurrence-text">{recurrenceInfo.frequency}</span>
      </span>

      {showFullDescription && (
        <div className="recurrence-details">
          <p className="recurrence-description">{recurrenceInfo.description}</p>

          {recurrenceInfo.days && recurrenceInfo.days.length > 0 && (
            <div className="recurrence-days">
              <span className="recurrence-label">Дни:</span>
              <div className="days-list">
                {recurrenceInfo.days.map((day, index) => (
                  <span key={index} className="day-badge">{day}</span>
                ))}
              </div>
            </div>
          )}

          {recurrenceInfo.interval && recurrenceInfo.interval > 1 && (
            <div className="recurrence-interval">
              <span className="recurrence-label">Интервал:</span>
              <span className="interval-value">каждые {recurrenceInfo.interval}</span>
            </div>
          )}

          {recurrenceInfo.count && (
            <div className="recurrence-count">
              <span className="recurrence-label">Количество:</span>
              <span className="count-value">{recurrenceInfo.count} раз</span>
            </div>
          )}

          {recurrenceInfo.until && (
            <div className="recurrence-until">
              <span className="recurrence-label">До:</span>
              <span className="until-date">
                {recurrenceInfo.until.toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecurrenceBadge;
