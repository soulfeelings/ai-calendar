import React from 'react';
import './LogoutModal.css';

interface LogoutModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const LogoutModal: React.FC<LogoutModalProps> = ({ isOpen, onConfirm, onCancel, isLoading = false }) => {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-overlay" onClick={onCancel}>
      <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="logout-modal-header">
          <h3>Подтвердите выход</h3>
          <button className="logout-modal-close" onClick={onCancel}>
            ×
          </button>
        </div>
        
        <div className="logout-modal-body">
          <p>Вы уверены, что хотите выйти из системы?</p>
        </div>
        
        <div className="logout-modal-footer">
          <button 
            className="logout-modal-cancel" 
            onClick={onCancel}
            disabled={isLoading}
          >
            Отмена
          </button>
          <button 
            className="logout-modal-confirm" 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Выход...' : 'Выйти'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal;
