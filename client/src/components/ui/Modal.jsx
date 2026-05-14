/**
 * Modal Component
 * Accessible dialog with backdrop
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modal = ({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',  // sm, md, lg, xl, fullscreen
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className = '',
}) => {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    fullscreen: 'max-w-[90vw] max-h-[90vh]',
  };

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'auto';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[var(--z-modal)] p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div 
        className={`
          bg-[var(--color-bg-primary)]
          rounded-xl
          shadow-xl
          ${sizes[size] || sizes.md}
          max-h-[90vh]
          overflow-y-auto
          animate-in fade-in zoom-in-95 duration-200
          ${className}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-bg-primary)] z-10">
          {title && (
            <h2 
              id="modal-title"
              className="text-xl font-semibold text-[var(--color-text-primary)]"
            >
              {title}
            </h2>
          )}
          {showCloseButton && (
            <button
              onClick={onClose}
              className="ml-auto p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
