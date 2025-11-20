import React, { ReactNode } from 'react';
import './Badge.css';

interface BadgeProps {
  children: ReactNode;
  variant?: 'primary' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'primary', size = 'md', className = '' }: BadgeProps) {
  return (
    <span className={`badge badge--${variant} badge--${size} ${className}`} style={{ fontSize: '1.25rem', fontWeight: 600 }}>
      {children}
    </span>
  );
}
