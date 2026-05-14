/**
 * Card Component
 * Reusable container with consistent styling
 */

import React from 'react';

const Card = React.forwardRef(({
  children,
  hoverable = false,
  className = '',
  as: Component = 'div',
  ...props
}, ref) => {
  const cardClass = `
    bg-[var(--color-bg-primary)]
    border border-[var(--color-border)]
    rounded-xl
    shadow-md
    ${hoverable ? 'hover:shadow-lg hover:border-[var(--color-primary)] transition-all duration-[var(--transition-normal)] cursor-pointer' : ''}
    ${className}
  `;

  return (
    <Component 
      ref={ref} 
      className={cardClass} 
      {...props}
    >
      {children}
    </Component>
  );
});

Card.displayName = 'Card';

const CardHeader = ({ children, className = '' }) => (
  <div className={`px-6 py-4 border-b border-[var(--color-border)] ${className}`}>
    {children}
  </div>
);

const CardBody = ({ children, className = '' }) => (
  <div className={`px-6 py-4 ${className}`}>
    {children}
  </div>
);

const CardFooter = ({ children, className = '' }) => (
  <div className={`px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-3 ${className}`}>
    {children}
  </div>
);

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
