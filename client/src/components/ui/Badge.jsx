/**
 * Badge Component
 * Small label component for status and tags
 */

import React from 'react';

const Badge = ({
  children,
  variant = 'default',  // default, success, warning, error, info
  size = 'md',
  icon: Icon,
  className = '',
  ...props
}) => {
  const variants = {
    default: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    error: 'bg-[var(--color-error-bg)] text-[var(--color-error)]',
    info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
    primary: 'bg-[var(--color-primary-bg)] text-[var(--color-primary)]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  const badgeClass = `
    inline-flex items-center gap-1
    font-medium
    rounded-full
    whitespace-nowrap
    ${variants[variant] || variants.default}
    ${sizes[size] || sizes.md}
    ${className}
  `;

  return (
    <span className={badgeClass} {...props}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </span>
  );
};

export default Badge;
