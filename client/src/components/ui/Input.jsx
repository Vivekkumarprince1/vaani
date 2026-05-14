/**
 * Input Component
 * Accessible text input with labels, error states, and helpers
 */

import React from 'react';

const Input = React.forwardRef(({
  label,
  error,
  helperText,
  size = 'md',
  disabled = false,
  required = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random()}`;

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-md',
    lg: 'px-4 py-3 text-lg',
  };

  const baseClass = `
    w-full
    bg-[var(--color-bg-primary)]
    border border-[var(--color-border)]
    rounded-lg
    text-[var(--color-text-primary)]
    placeholder-[var(--color-text-tertiary)]
    transition-all duration-[var(--transition-normal)]
    focus-ring
    disabled:opacity-50 disabled:cursor-not-allowed
    ${sizes[size] || sizes.md}
    ${error ? 'border-[var(--color-error)]' : 'hover:border-[var(--color-primary)]'}
    ${Icon ? (iconPosition === 'left' ? 'pl-10' : 'pr-10') : ''}
    ${className}
  `;

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--color-text-primary)] mb-2"
        >
          {label}
          {required && <span className="text-[var(--color-error)] ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          className={baseClass}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error || helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {Icon && (
          <div className={`absolute top-1/2 transform -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none ${
            iconPosition === 'left' ? 'left-3' : 'right-3'
          }`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(error || helperText) && (
        <div 
          id={`${inputId}-helper`}
          className={`text-sm mt-1 ${
            error 
              ? 'text-[var(--color-error)]' 
              : 'text-[var(--color-text-secondary)]'
          }`}
        >
          {error || helperText}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
