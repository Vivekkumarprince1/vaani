/**
 * useTheme Hook
 * Manages theme switching (light/dark)
 * Persists preference to localStorage
 * Respects system preference by default
 */

import { useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'vaani-theme-preference';
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

export const useTheme = () => {
  const [theme, setThemeState] = useState('system');
  const [resolvedTheme, setResolvedTheme] = useState('light');
  const [mounted, setMounted] = useState(false);

  // Detect system preference
  const getSystemTheme = useCallback(() => {
    if (typeof window === 'undefined') return THEMES.LIGHT;
    return window.matchMedia('(prefers-color-scheme: dark)').matches 
      ? THEMES.DARK 
      : THEMES.LIGHT;
  }, []);

  // Get effective theme (resolved from system if needed)
  const getEffectiveTheme = useCallback((currentTheme) => {
    return currentTheme === THEMES.SYSTEM ? getSystemTheme() : currentTheme;
  }, [getSystemTheme]);

  // Apply theme to DOM
  const applyTheme = useCallback((themeToApply) => {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    const effective = getEffectiveTheme(themeToApply);

    // Remove both classes
    html.classList.remove(THEMES.LIGHT, THEMES.DARK);
    // Add appropriate class
    html.classList.add(effective);
    
    // Also set data attribute for Tailwind
    html.setAttribute('data-theme', effective);
    
    // Update color scheme
    document.documentElement.style.colorScheme = effective;
  }, [getEffectiveTheme]);

  // Initialize theme on mount
  useEffect(() => {
    // Get stored preference or default to system
    const stored = localStorage.getItem(THEME_KEY);
    const initial = stored || THEMES.SYSTEM;
    
    setThemeState(initial);
    
    const effective = getEffectiveTheme(initial);
    setResolvedTheme(effective);
    
    applyTheme(initial);
    setMounted(true);
    
    console.log('[Theme] Initialized:', { stored, initial, effective });
  }, [getEffectiveTheme, applyTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Only listen if user has system theme selected
    if (theme !== THEMES.SYSTEM) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      const newTheme = e.matches ? THEMES.DARK : THEMES.LIGHT;
      setResolvedTheme(newTheme);
      applyTheme(THEMES.SYSTEM);
      console.log('[Theme] System preference changed:', newTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  // Set theme
  const setTheme = useCallback((newTheme) => {
    if (!Object.values(THEMES).includes(newTheme)) {
      console.warn('[Theme] Invalid theme:', newTheme);
      return;
    }

    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    
    const effective = getEffectiveTheme(newTheme);
    setResolvedTheme(effective);
    
    applyTheme(newTheme);
    
    console.log('[Theme] Changed:', { newTheme, effective });
  }, [getEffectiveTheme, applyTheme]);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  return {
    theme,              // User preference (light, dark, system)
    resolvedTheme,      // Actual effective theme (light or dark)
    setTheme,           // Set theme preference
    toggleTheme,        // Toggle between light and dark
    isDark: resolvedTheme === THEMES.DARK,
    isLight: resolvedTheme === THEMES.LIGHT,
    mounted,            // Whether component has mounted (for hydration safety)
  };
};

export default useTheme;
