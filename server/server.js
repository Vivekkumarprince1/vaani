
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const handleAudioTranslation = require('./server/socket/audioHandler');
const handleGroupCallAudioTranslation = require('./server/socket/groupCallAudioHandler');
const socketHandlers = require('./server/socket/socketHandlers');
const redisManager = require('./server/redis/RedisManager');

// Validate Azure env and expose TTS availability
const { config: envConfig } = require('./server/utils/env');
const ttsAvailable = Boolean(envConfig.AZURE_SPEECH_KEY && envConfig.AZURE_SPEECH_REGION);
global.__TTS_AVAILABLE = ttsAvailable;

console.log('🔑 Azure Configuration:');
console.log('  AZURE_SPEECH_KEY:', envConfig.AZURE_SPEECH_KEY ? '✅ Loaded' : '❌ Missing');
console.log('  AZURE_SPEECH_REGION:', envConfig.AZURE_SPEECH_REGION ? '✅ Loaded' : '❌ Missing');
console.log('  AZURE_TRANSLATOR_KEY:', envConfig.AZURE_TRANSLATOR_KEY ? '✅ Loaded' : '❌ Missing');
console.log('  AZURE_TRANSLATOR_REGION:', envConfig.AZURE_TRANSLATOR_REGION ? '✅ Loaded' : '❌ Missing');
console.log('  JWT_SECRET:', envConfig.JWT_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('  NODE_ENV:', envConfig.NODE_ENV || 'development');
console.log('  PORT:', envConfig.PORT || '3001');
console.log('  ALLOWED_ORIGINS:', envConfig.ALLOWED_ORIGINS || '❌ Missing');
console.log('  LIVEKIT_URL:', envConfig.LIVEKIT_URL || '❌ Missing');
console.log('  LIVEKIT_API_KEY:', envConfig.LIVEKIT_API_KEY ? '✅ Loaded' : '❌ Missing (SFU disabled)');


if (!ttsAvailable) {
  console.warn('\n⚠️ Text-to-Speech is NOT available. Group-call TTS will be skipped and clients will receive text-only translations.');
  console.warn('   Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in your environment or .env to enable server TTS.\n');
} else {
  console.log('\n✅ Text-to-Speech is available and will be used for translated audio in group calls.');
}

const port = parseInt(process.env.PORT || '3001', 10); // Different port for backend

const app = express();
app.use(cors({
  origin: envConfig.ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json());

// Ensure MongoDB is connected once at startup. Other modules may still call connectDB(),
// but the implementation in `lib/db.js` is idempotent and will return the cached connection.
const connectDB = require('./lib/db');

// API Routes will be mounted here
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const translatorRoutes = require('./routes/translator');
app.use('/api/translator', translatorRoutes);

const chatRoutes = require('./routes/chat');
app.use('/api/chat', chatRoutes);

const livekitRoutes = require('./routes/livekit');
app.use('/api/livekit', livekitRoutes);

const server = createServer(app);

// Store active users and their rooms
const users = {}; // Keyed by socketId
const userIdToSocketId = {}; // Keyed by userId for O(1) lookups
// Expose the in-memory connected users map to other modules (for online-only APIs)
global.__connectedUsers = users;
const rooms = {};

// Helper function to find user by userId
const findUserByUserId = (userId) => {
  const socketId = userIdToSocketId[userId];
  return socketId ? users[socketId] : null;
};

// Initialize Socket.IO with OPTIMIZED settings for low latency
const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: envConfig.ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
  },
  // ✅ OPTIMIZED: Allow both transports but prefer WebSocket
  transports: ['websocket', 'polling'],
  allowUpgrades: true, // Allow upgrade from polling to WebSocket
  upgradeTimeout: 10000,
  
  // ✅ OPTIMIZED: Reduce ping intervals for faster connection checks
  pingTimeout: 60000,
  pingInterval: 25000,
  
  // ✅ OPTIMIZED: Increase buffer for larger audio payloads
  maxHttpBufferSize: 1e7, // 10MB (was 5MB)
  
  // ✅ OPTIMIZED: Disable compression for speed (trade bandwidth for latency)
  perMessageDeflate: false, // Compression adds latency
  
  connectTimeout: 30000,
  serveClient: false
});

// Expose io globally so routes can emit events
global.__io = io;
console.log('Global Socket.IO instance set: global.__io');

// Wire Socket.IO Redis adapter for horizontal scaling (when Redis is available)
if (redisManager.isReady && redisManager.client) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = redisManager.client.duplicate();
    const subClient = redisManager.client.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter enabled — horizontal scaling active');
  } catch (err) {
    console.warn('⚠️ Socket.IO Redis adapter unavailable (install @socket.io/redis-adapter for multi-instance scaling):', err.message);
  }
} else {
  console.log('ℹ️ Socket.IO using default in-memory adapter (single-instance mode)');
}

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  
  if (!token) {
    console.error('No token provided for socket connection');
    return next(new Error('Authentication error: No token provided'));
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.user = decoded;
    next();
  } catch (err) {
    console.error('Socket authentication failed:', err.message);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket event handlers
socketHandlers(io, users, rooms, findUserByUserId, userIdToSocketId);

// Cleanup stale connections every 5 minutes
setInterval(() => {
  console.log('Cleaning up stale connections');
  Object.keys(users).forEach(socketId => {
    const user = users[socketId];
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      console.log(`Removing stale user: socketId=${socketId}, userId=${user?.userId}`);
      if (user?.userId) delete userIdToSocketId[user.userId];
      delete users[socketId];
    }
  });
}, 5 * 60 * 1000);

// Start server after ensuring MongoDB connection
async function startServer() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Failed to connect to MongoDB during startup. Exiting.');
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Backend server running on port http://localhost:${port}`);
  });
}

startServer();
