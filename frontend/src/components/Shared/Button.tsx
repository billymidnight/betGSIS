import React from 'react';
import './Button.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`btn btn-${variant} btn-${size} ${className || ''}`}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? <span className="spinner" /> : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
