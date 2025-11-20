import React, { ReactNode, useEffect } from 'react';
import { Button } from './Button';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideFooter?: boolean;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  hideFooter = false,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className={`modal modal--${size}`}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>
        <div className="modal-content">{children}</div>
        {!hideFooter && (
          <div className="modal-footer">
            <Button variant="secondary" onClick={onClose}>
              {cancelLabel}
            </Button>
            {onConfirm && (
              <Button variant="primary" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
