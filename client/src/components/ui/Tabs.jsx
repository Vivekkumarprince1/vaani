/**
 * Tabs Component
 * Accessible tabbed interface
 */

import React, { useState } from 'react';

const Tabs = ({ 
  tabs, // array of { id, label, content }
  defaultActive = null,
  onChange,
  className = '',
}) => {
  const [active, setActive] = useState(defaultActive || tabs[0]?.id);

  const handleTabClick = (tabId) => {
    setActive(tabId);
    onChange?.(tabId);
  };

  const activeTab = tabs.find(t => t.id === active);

  return (
    <div className={`w-full ${className}`}>
      {/* Tab Buttons */}
      <div 
        className="flex gap-0 border-b border-[var(--color-border)]"
        role="tablist"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => handleTabClick(tab.id)}
            className={`
              px-4 py-3
              font-medium
              border-b-2
              transition-all duration-[var(--transition-normal)]
              focus-ring
              ${active === tab.id
                ? 'border-b-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-b-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab && (
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab.id}`}
          aria-labelledby={`tab-${activeTab.id}`}
          className="py-4 animate-in fade-in duration-200"
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
};

export default Tabs;
