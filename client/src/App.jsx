import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TranslationProvider } from './contexts/TranslationContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import JoinCall from './pages/JoinCall';
import './index.css';

function App() {
  return (
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
  );
}

export default App;
