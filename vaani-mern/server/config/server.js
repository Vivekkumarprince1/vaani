const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Log important configurations on startup
const logConfig = () => {
  console.log('Environment Configuration:');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('PORT:', process.env.PORT || 2000);
  console.log('MongoDB:', process.env.MONGO_URI ? 'Configured' : 'Not Configured');
  console.log('Azure Translator:', process.env.AZURE_TRANSLATOR_KEY ? 'Configured' : 'Not Configured');
  console.log('Azure Speech:', process.env.AZURE_SPEECH_KEY ? 'Configured' : 'Not Configured');
};

// CORS configuration (allow all)
const getCorsConfig = () => {
  const corsOptions = {
    origin: (origin, callback) => {
      callback(null, true); // ✅ Always allow all origins
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
  };

  return { allowedOrigins: '*', corsOptions };
};

module.exports = {
  logConfig,
  getCorsConfig,
  PORT: process.env.PORT || 2000
};
