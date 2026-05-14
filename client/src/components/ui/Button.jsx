/**
 * Button Component
 * Accessible button with multiple variants and sizes
 */

import React from 'react';

const Button = React.forwardRef(({
  children,
  variant = 'primary',  // primary, secondary, ghost, danger
  size = 'md',           // sm, md, lg
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  type = 'button',
  ...props
}, ref) => {
  // Variants
  const variants = {
    primary: `
      bg-[var(--color-primary)] 
      hover:bg-[var(--color-primary-light)] 
      active:bg-[var(--color-primary-dark)]
      text-white
      disabled:bg-gray-400 disabled:cursor-not-allowed
    `,
    secondary: `
      bg-[var(--color-secondary)] 
      hover:bg-[var(--color-secondary-light)] 
      active:bg-[var(--color-secondary-dark)]
      text-white
      disabled:bg-gray-400 disabled:cursor-not-allowed
    `,
    ghost: `
      bg-transparent
      hover:bg-[var(--color-bg-tertiary)]
      text-[var(--color-text-primary)]
      border border-[var(--color-border)]
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    danger: `
      bg-[var(--color-error)] 
      hover:bg-red-600
      active:bg-red-700
      text-white
      disabled:bg-gray-400 disabled:cursor-not-allowed
    `,
  };

  // Sizes
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-md',
    lg: 'px-6 py-3 text-lg',
  };

  const buttonClass = `
    inline-flex items-center justify-center gap-2
    font-medium rounded-lg
    transition-all duration-[var(--transition-normal)]
    focus-ring
    whitespace-nowrap
    ${variants[variant] || variants.primary}
    ${sizes[size] || sizes.md}
    ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md active:shadow-sm'}
    ${className}
  `;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClass}
      {...props}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
      )}
      {Icon && iconPosition === 'left' && !loading && <Icon className="w-5 h-5" />}
      {children}
      {Icon && iconPosition === 'right' && !loading && <Icon className="w-5 h-5" />}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
