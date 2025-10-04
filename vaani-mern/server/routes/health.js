const express = require('express');
const router = express.Router();
const { healthCheck, checkMongoDB, checkNodeEnvironment, checkSystemResources } = require('../utils/healthCheck');

/**
 * @route   GET /api/health
 * @desc    Get comprehensive health check information
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const health = await healthCheck();
    
    // Set appropriate status code based on health status
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/health/mongodb
 * @desc    Get MongoDB health status only
 * @access  Public
 */
router.get('/mongodb', async (req, res) => {
  try {
    const mongoStatus = await checkMongoDB();
    const statusCode = mongoStatus.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(mongoStatus);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * @route   GET /api/health/node
 * @desc    Get Node.js environment information
 * @access  Public
 */
router.get('/node', async (req, res) => {
  try {
    const nodeStatus = checkNodeEnvironment();
    res.status(200).json(nodeStatus);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * @route   GET /api/health/system
 * @desc    Get system resources information
 * @access  Public
 */
router.get('/system', async (req, res) => {
  try {
    const systemStatus = checkSystemResources();
    res.status(200).json(systemStatus);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

/**
 * @route   GET /api/health/basic
 * @desc    Simplified health check for load balancers
 * @access  Public
 */
router.get('/basic', async (req, res) => {
  try {
    // Just check if the server is up and running
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error' });
  }
});

module.exports = router; 