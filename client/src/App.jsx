import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useTranslation } from './contexts/TranslationContext'; // Fixed: use named import
import { TranslationProvider } from './contexts/TranslationContext'; // Keep the default export
import ThemeProvider from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import JoinCall from './pages/JoinCall';
import './index.css';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <TranslationProvider>
            <Router>
              <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/join/:callRoomId" element={<JoinCall />} />
              </Routes>
            </Router>
          </TranslationProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
