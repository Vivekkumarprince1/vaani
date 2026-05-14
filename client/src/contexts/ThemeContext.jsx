/**
 * ThemeContext
 * Provides theme management throughout the app
 */

import React, { createContext } from 'react';
import useTheme from '../hooks/useTheme';

export const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const theme = useTheme();

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
