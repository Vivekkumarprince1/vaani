// src/contexts/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { config } from '../config/api';

const API_URL = config.API_URL;

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('token');
    }
    return true;
  });
  const [loadingMessage, setLoadingMessage] = useState("Checking authentication...");

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        setLoadingMessage("Validating your session...");
        // Set default headers for all axios requests
        axios.defaults.headers.common['x-auth-token'] = token;

        // Fetch user data
        setLoadingMessage("Loading your profile...");
        const res = await axios.get(`${API_URL}/auth/me`);
        setUser(res.data);
        setIsAuthenticated(true);
      } catch (err) {
        console.error('Authentication error:', err);
        localStorage.removeItem('token');
      } finally {
        setLoadingMessage("Starting application...");
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Login user with mobile number
  const login = async (mobileNumber, password) => {
    try {
      setLoadingMessage("Logging in...");
      const res = await axios.post(`${API_URL}/auth/login`, { mobileNumber, password });
      localStorage.setItem('token', res.data.token);

      // Set token in axios headers
      axios.defaults.headers.common['x-auth-token'] = res.data.token;

      // Use the user data directly from the login response
      setUser(res.data.user);
      setIsAuthenticated(true);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || 'Login failed'
      };
    }
  };

  // Register user
  const register = async (userData) => {
    try {
      setLoadingMessage("Creating your account...");
      // Registration now returns the token and user directly
      const res = await axios.post(`${API_URL}/auth/register`, {
        username: userData.username,
        mobileNumber: userData.mobileNumber,
        password: userData.password
      });

      // Login directly using the registration response
      setLoadingMessage("Logging you in...");
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['x-auth-token'] = res.data.token;
      setUser(res.data.user);
      setIsAuthenticated(true);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || 'Registration failed'
      };
    }
  };

  // Logout user
  const logout = async () => {
    try {
      // Call backend logout API to update status in database
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_URL}/auth/logout`, {}, {
          headers: { 'x-auth-token': token }
        }).catch(err => {
          console.warn('Logout API call failed:', err);
        });
      }
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      // Clean up local state regardless of API call result
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['x-auth-token'];
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        loadingMessage,
        setLoadingMessage,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};