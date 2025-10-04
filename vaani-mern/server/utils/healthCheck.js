const mongoose = require('mongoose');

/**
 * Check MongoDB connection status
 * @returns {Promise<object>} - Connection status
 */
const checkMongoDB = async () => {
  try {
    const state = mongoose.connection.readyState;
    let status = 'unknown';
    
    switch (state) {
      case 0:
        status = 'disconnected';
        break;
      case 1:
        status = 'connected';
        break;
      case 2:
        status = 'connecting';
        break;
      case 3:
        status = 'disconnecting';
        break;
    }
    
    return {
      service: 'MongoDB',
      status: status === 'connected' ? 'healthy' : 'unhealthy',
      details: {
        connection: status,
        host: mongoose.connection.host || 'Not connected'
      }
    };
  } catch (error) {
    return {
      service: 'MongoDB',
      status: 'error',
      details: {
        error: error.message
      }
    };
  }
};

/**
 * Check Node.js environment health
 * @returns {object} - Node environment information
 */
const checkNodeEnvironment = () => {
  return {
    service: 'Node Environment',
    status: 'healthy',
    details: {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }
  };
};

/**
 * Check system resources
 * @returns {object} - System resources status
 */
const checkSystemResources = () => {
  return {
    service: 'System Resources',
    status: 'healthy',
    details: {
      freeMemory: process.memoryUsage().heapUsed / 1024 / 1024
    }
  };
};

/**
 * Comprehensive health check
 * @returns {Promise<object>} - Health check results
 */
const healthCheck = async () => {
  try {
    // Run all checks
    const mongoStatus = await checkMongoDB();
    const nodeStatus = checkNodeEnvironment();
    const systemStatus = checkSystemResources();
    
    // Determine overall health status
    const services = [mongoStatus, nodeStatus, systemStatus];
    const healthy = services.every(service => service.status === 'healthy');
    
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services
    };
  } catch (error) {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
};

module.exports = {
  healthCheck,
  checkMongoDB,
  checkNodeEnvironment,
  checkSystemResources
};