import React from 'react';
import Toast from './Toast';
import { useUIStore } from '../../lib/state/uiStore';
import './Toast.css';

export default function ToastContainer() {
  const toasts = useUIStore((state) => state.toasts);
  const removeToast = useUIStore((state) => state.removeToast);

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={removeToast}
          duration={toast.duration}
        />
      ))}
    </div>
  );
}
