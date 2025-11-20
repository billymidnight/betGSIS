import React, { useEffect } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  id: string;
  message: string;
  type?: ToastType;
  onClose: (id: string) => void;
  duration?: number;
}

export default function Toast({
  id,
  message,
  type = 'info',
  onClose,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  return (
    <div className={`toast toast--${type}`}>
      <div className="toast-icon">
        {type === 'success' && '✓'}
        {type === 'error' && '✕'}
        {type === 'info' && 'ℹ'}
        {type === 'warning' && '⚠'}
      </div>
      <div className="toast-message">{message}</div>
      <button className="toast-close" onClick={() => onClose(id)} aria-label="Close toast">
        ×
      </button>
    </div>
  );
}
