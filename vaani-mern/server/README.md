# Vani Backend (Clean Version)

This is a clean version of the Vani chat application backend, with all Azure deployment-specific components removed.

## Features

- Real-time chat functionality
- User authentication
- Message translation
- Socket.IO for real-time communication

## Setup Instructions

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure your environment variables by renaming `.env.example` to `.env` and updating the values
4. Start the development server:
   ```
   npm run dev
   ```
5. For production:
   ```
   npm start
   ```

## Environment Variables

Make sure to set these in your `.env` file:

- `NODE_ENV` - Set to 'development' or 'production'
- `PORT` - The port to run the server on (default: 2000)
- `JWT_SECRET` - Secret key for JWT authentication
- `JWT_EXPIRY` - JWT token expiry time in milliseconds
- `MONGO_URI` - MongoDB connection string
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

## API Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login existing user
- `GET /api/chat` - Get chat history
- `POST /api/chat` - Send a new message
- `POST /api/translator` - Translate text

## Socket Events

- `connection` - Client connected
- `disconnect` - Client disconnected
- `join` - Join a chat room
- `chat message` - New chat message
- `typing` - User is typing 