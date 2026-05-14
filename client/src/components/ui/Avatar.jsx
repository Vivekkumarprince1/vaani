/**
 * Avatar Component
 * User profile image with initials fallback
 */

import React, { useState } from 'react';

const Avatar = ({
  src,
  alt = 'User avatar',
  initials,
  size = 'md',
  status,  // 'online', 'offline', 'away'
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const statusColors = {
    online: 'bg-[var(--color-success)]',
    offline: 'bg-gray-400',
    away: 'bg-yellow-400',
  };

  const statusSize = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-4 h-4',
  };

  const showImage = src && !imageError;

  return (
    <div className={`relative inline-flex ${className}`}>
      <div className={`
        rounded-full
        bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-primary-dark)]
        text-white
        font-semibold
        flex items-center justify-center
        overflow-hidden
        ${sizes[size] || sizes.md}
      `}>
        {showImage ? (
          <img
            src={src}
            alt={alt}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials || '?'}</span>
        )}
      </div>

      {status && (
        <div className={`
          absolute bottom-0 right-0
          ${statusSize[size] || statusSize.md}
          ${statusColors[status] || statusColors.offline}
          rounded-full
          border-2 border-[var(--color-bg-primary)]
        `} 
        aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
};

export default Avatar;
