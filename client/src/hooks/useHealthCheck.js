/**
 * Health Check Hook
 * Verifies backend connectivity on app startup
 */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { config } from '../config/api';

export const useHealthCheck = () => {
  const [backendHealthy, setBackendHealthy] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setChecking(true);
        
        // Simple GET request to health endpoint with short timeout
        const response = await axios.get(`${config.API_URL.replace('/api', '')}/health`, {
          timeout: 5000,
          validateStatus: (status) => status === 200 // Accept only 200
        });
        
        if (response.status === 200) {
          setBackendHealthy(true);
          console.log('✅ Backend health check passed');
        } else {
          setBackendHealthy(false);
          console.warn('⚠️  Backend returned non-200 status:', response.status);
        }
      } catch (error) {
        setBackendHealthy(false);
        console.warn('⚠️  Backend health check failed:', error.message);
        // This is expected in development with mock API
      } finally {
        setChecking(false);
      }
    };

    // Run health check on mount
    checkHealth();

    // Recheck every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return { backendHealthy, checking };
};

export default useHealthCheck;
