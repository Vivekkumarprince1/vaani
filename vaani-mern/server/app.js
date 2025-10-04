const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const { logConfig, getCorsConfig, PORT } = require('./config/server');
const { initializeSocket } = require('./socket');

// Log environment info
logConfig();

// Setup Express and HTTP server
const app = express();
const server = http.createServer(app);

// Get CORS configuration
const { allowedOrigins, corsOptions } = getCorsConfig();

// Initialize Socket.IO
const io = initializeSocket(server, allowedOrigins);

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());

// Define routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/translator', require('./routes/translator'));
app.use('/api/health', require('./routes/health'));

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Welcome route
app.get('/', (req, res) => {
  res.send("Welcome to Vani backend API");
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Internal Server Error',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
});

// Connect DB and start server
connectDB()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err);
    if (process.env.NODE_ENV === 'development') {
      console.warn('Starting server WITHOUT DB in development mode');
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${PORT} (NO DB)`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
      });
    }
  });

module.exports = app;