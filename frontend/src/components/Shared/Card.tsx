import React, { ReactNode } from 'react';
import './Card.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'interactive' | 'elevated';
  title?: ReactNode;
}

export default function Card({
  children,
  className = '',
  onClick,
  variant = 'default',
  title,
}: CardProps) {
  return (
    <div
      className={`card card--${variant} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {title && <h3 className="card-title">{title}</h3>}
      <div className="card-content">{children}</div>
    </div>
  );
}
