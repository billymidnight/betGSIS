import React, { InputHTMLAttributes } from 'react';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  icon?: React.ReactNode;
}

export default function Input({
  label,
  error,
  helpText,
  icon,
  className = '',
  ...props
}: InputProps) {
  const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={`input-wrapper ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      <div className="input-container">
        {icon && <div className="input-icon">{icon}</div>}
        <input {...props} id={inputId} className={`input ${icon ? 'input--with-icon' : ''}`} />
      </div>
      {error && <div className="input-error">{error}</div>}
      {helpText && !error && <div className="input-help">{helpText}</div>}
    </div>
  );
}
