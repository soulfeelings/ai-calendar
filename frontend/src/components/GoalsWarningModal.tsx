import React from 'react';
import './GoalsWarningModal.css';

interface GoalsWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToGoals: () => void;
  mode: 'week' | 'tomorrow';
}

const GoalsWarningModal: React.FC<GoalsWarningModalProps> = ({
  isOpen,
  onClose,
  onGoToGoals,
  mode
}) => {
  if (!isOpen) return null;

  const modeText = mode === 'week' ? 'недельное расписание' : 'расписание на завтра';

  return (
    <div className="goals-warning-modal-overlay">
      <div className="goals-warning-modal">
        <div className="modal-header">
          <h2>🎯 Цели не найдены</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className="modal-content">
          <div className="warning-icon">⚠️</div>
          <h3>Для создания {modeText} необходимы цели</h3>
          <p>
            ИИ не может создать персонализированное расписание без ваших целей. 
            Цели помогают ИИ понять ваши приоритеты и правильно распределить время.
          </p>
          
          <div className="goals-benefits">
            <h4>Что дают цели:</h4>
            <ul>
              <li>📊 Персонализированное планирование</li>
              <li>⚡ Оптимальное распределение времени</li>
              <li>🎯 Фокус на важных задачах</li>
              <li>📈 Отслеживание прогресса</li>
            </ul>
          </div>
        </div>
        
        <div className="modal-actions">
          <button className="secondary-btn" onClick={onClose}>
            Отменить
          </button>
          <button className="primary-btn" onClick={onGoToGoals}>
            🎯 Создать цели
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalsWarningModal;
