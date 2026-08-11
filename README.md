# 🎙️ Vaani - Real-Time Multilingual Communication Platform

**Vaani** is an end-to-end, high-performance real-time communication platform featuring video and audio conferencing, instant messaging, and live multilingual speech-to-speech audio & text translation.

Powered by **LiveKit SFU**, **Azure Cognitive Services**, **Socket.IO**, **Redis**, **MongoDB**, and **React + Vite**, Vaani bridges language barriers across global conversations in peer-to-peer and group calls.

---

## ✨ Features

- 🌐 **Real-Time Live Speech Translation**: Translates spoken audio in real time during 1-on-1 and group video/audio calls using Azure Speech SDK and Azure Translator.
- 🔊 **Text-to-Speech (TTS) Synthesis**: Synthesizes translated transcripts into natural voice output for multi-party call participants.
- 📹 **Scalable Video & Audio Conferencing**: Powered by LiveKit Selective Forwarding Unit (SFU) for low-latency, high-quality media streaming.
- 💬 **Instant Messaging & Chat Rooms**: Persistent and real-time chat with Socket.IO, channel support, and message history storage.
- 🔄 **Horizontal Scaling with Redis**: Event synchronization and Socket.IO adapter across multi-instance server deployments.
- 📁 **Rich Media & File Uploads**: Integrated with Cloudinary and Multer for seamless sharing of images and documents.
- 🔐 **Secure Authentication**: JWT-based authentication with salted password hashing using `bcryptjs`.
- ⚡ **Optimized Web UI**: React 18 frontend built with Vite, Tailwind CSS, IndexedDB offline caching, and responsive UI components.

---

## 🛠️ Tech Stack

### Frontend (`/client`)
- **Core**: React 18, React Router v7, Vite (Rolldown Vite)
- **Styling**: Tailwind CSS, PostCSS, Heroicons, React Icons
- **Real-Time & Media**: LiveKit Client SDK (`livekit-client`, `@livekit/components-react`), Socket.IO Client, Web Audio API
- **State & Data**: IndexedDB (`idb`), Axios, `p-limit`

### Backend (`/server`)
- **Core**: Node.js, Express.js
- **Real-Time & Scaling**: Socket.IO, Redis (`ioredis`, `@socket.io/redis-adapter`)
- **Media & SFU**: LiveKit Server SDK (`livekit-server-sdk`), `@livekit/rtc-node`
- **AI & Translation**: Microsoft Azure Speech SDK (`microsoft-cognitiveservices-speech-sdk`), Azure Translator API
- **Database & Auth**: MongoDB with Mongoose, JSON Web Tokens (JWT), `bcryptjs`
- **File Storage**: Cloudinary, Multer

---

## 📁 Repository Structure

```text
vaani/
├── client/                     # Frontend React + Vite Web Application
│   ├── src/
│   │   ├── components/        # UI & Reusable Components (ErrorBoundary, Chat, Video Call, etc.)
│   │   ├── config/            # Centralized API & Socket configuration (api.js)
│   │   ├── contexts/          # React Contexts (AuthContext, TranslationContext)
│   │   ├── hooks/             # Custom Hooks (useHealthCheck, etc.)
│   │   ├── pages/             # Page views (Dashboard, Login, Register, JoinCall)
│   │   ├── rtc/ & sfu/        # WebRTC & LiveKit integration helpers
│   │   ├── translation/       # Audio streaming & speech translation handlers
│   │   └── utils/             # Socket manager, IndexedDB, audio utilities
│   ├── CONFIGURATION.md       # Client-specific deployment & debug guide
│   └── package.json
│
└── server/                     # Backend Express + Socket.IO Server
    ├── controllers/           # Auth, Chat, Translation, and Call Controllers
    ├── middleware/            # Auth & Validation Middlewares
    ├── routes/                # Express API endpoints (/api/auth, /api/chat, /api/livekit, etc.)
    ├── scripts/               # Database seed scripts
    ├── server/
    │   ├── redis/             # Redis Manager & Socket.IO adapter configuration
    │   ├── socket/            # Socket.IO handlers, Audio & Group Call translation pipelines
    │   └── utils/             # Environment validation & Azure helpers
    ├── server.js              # Server entry point
    ├── render.yaml            # Render deployment configuration
    └── package.json
```

---

## ⚙️ Environment Configuration

### Backend Setup (`server/.env`)

Create a `.env` file in the `server` directory using `server/.env.example` as a template:

```ini
# Server Configuration
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173

# Database
MONGO_URI=mongodb://localhost:27017/vaani

# Authentication
JWT_SECRET=your_jwt_secret_key_here

# Redis (Required for multi-instance scaling & Socket.IO sync)
REDIS_URL=redis://localhost:6379

# LiveKit SFU (Required for video/audio calls)
LIVEKIT_URL=wss://your-livekit-domain.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# Azure Cognitive Services (Required for live speech & text translation)
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=your_azure_speech_region
AZURE_TRANSLATOR_KEY=your_azure_translator_key
AZURE_TRANSLATOR_REGION=your_azure_translator_region

# Cloudinary (Optional, for media storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Frontend Setup (`client/.env`)

Create a `.env` file in the `client` directory using `client/.env.example` as a template:

```ini
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
VITE_NODE_ENV=development
VITE_USE_LIVEKIT_AUDIO_TRACKS=false
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** v18.x or higher
- **npm** v9.x or higher
- **MongoDB** (Local instance or MongoDB Atlas cluster)
- **Redis** (Local instance or cloud Redis server, optional for single-instance dev)

---

### Installation & Run Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/Vivekkumarprince1/vaani.git
   cd vaani
   ```

2. **Setup and Start Backend**
   ```bash
   cd server
   npm install
   
   # Seed initial database data (optional)
   npm run seed

   # Start development server
   npm run dev:watch
   ```
   *The server will run on `http://localhost:3001`.*

3. **Setup and Start Frontend**
   ```bash
   cd ../client
   npm install

   # Start frontend Vite dev server
   npm run dev
   ```
   *The frontend client will run on `http://localhost:5173`.*

---

## 📜 Available Scripts

### Server (`/server`)
- `npm run dev` - Run backend server with `node server.js`
- `npm run dev:watch` - Run server in watch mode using `nodemon`
- `npm start` - Run server in production mode (`NODE_ENV=production`)
- `npm run test` - Execute backend test suite using Jest
- `npm run seed` - Run database seeding script

### Client (`/client`)
- `npm run dev` - Start Vite development server
- `npm run build` - Build production-optimized static bundle
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint checks

---

## 🚢 Deployment

- **Backend (Render / PaaS)**: The project includes a [`render.yaml`](file:///Users/vivekkumar/Documents/development/vaani/server/render.yaml) configuration ready for deploying the server to Render.
- **Frontend (Vercel / Netlify)**: The client project includes [`vercel.json`](file:///Users/vivekkumar/Documents/development/vaani/client/vercel.json) configured for single-page application routing and assets deployment.

For detailed production build checklist and troubleshooting, refer to [`client/CONFIGURATION.md`](file:///Users/vivekkumar/Documents/development/vaani/client/CONFIGURATION.md).

---

## 📄 License

This project is licensed under the MIT License - see the repository details for more information.
