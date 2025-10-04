# Vaani - Next.js Video Calling & Chat AppThis is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).



A real-time video calling and chat application built with Next.js, featuring multilingual support, real-time translation, and WebRTC video calls.## Getting Started



## 🚀 FeaturesFirst, run the development server:



- **User Authentication**: JWT-based secure authentication system```bash

- **Real-time Chat**: Socket.IO powered instant messagingnpm run dev

- **Video Calling**: WebRTC-based peer-to-peer video calls# or

- **Multilingual Support**: Built-in translation for 20+ languagesyarn dev

- **Group Chats**: Create and manage group conversations# or

- **Online Status**: Real-time user presence indicatorspnpm dev

- **Responsive Design**: Optimized for desktop and mobile devices# or

- **Modern UI**: Built with Tailwind CSS for a sleek interfacebun dev

```

## 📋 Prerequisites

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

- Node.js (v18 or higher)

- MongoDB (local or Atlas)You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

- npm or yarn

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 🛠️ Installation

## Learn More

1. **Install dependencies**

   ```bashTo learn more about Next.js, take a look at the following resources:

   npm install

   ```- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.

- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

2. **Configure environment variables**

   You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

   Edit `.env.local` file:

   ```env## Deploy on Vercel

   # Database

   MONGO_URI=mongodb://localhost:27017/vaaniThe easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.



   # JWT SecretCheck out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

   JWT_SECRET=your_strong_jwt_secret_here

   # API URL
   NEXT_PUBLIC_API_URL=/api

   # Socket.IO Server (if separate server)
   NEXT_PUBLIC_SOCKET_URL=http://localhost:2000
   ```

3. **Start MongoDB**
   ```bash
   # For local MongoDB
   mongod
   ```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

Visit `http://localhost:3000`

### Notes for this copy

- This project uses a custom server (`server.js`) that runs Next.js and a Socket.IO server. The `dev` script runs `node server.js`.
- Environment variables are loaded from `.env.local`. Make sure to copy `.env.example` to `.env.local` and fill the required values (MongoDB URI, Azure keys, JWT secret).
- Translation caching: the client now persists recent translations and small model metadata into IndexedDB to reduce translation latency during calls. You can clear the persistent cache by changing the preferred language in-app or manually clearing site storage in the browser.

### Production Build
```bash
npm run build
npm start
```

## 📁 Project Structure

```
next/
├── app/                  # Next.js App Router
│   ├── api/             # API Routes (Backend)
│   ├── dashboard/       # Dashboard page
│   ├── login/           # Login page
│   └── register/        # Register page
├── lib/                 # Server-side utilities
│   ├── db.js           # MongoDB connection
│   ├── auth.js         # Auth middleware
│   └── models/         # Mongoose models
├── src/
│   ├── components/     # React components
│   ├── contexts/       # React contexts
│   └── utils/          # Client utilities
└── public/             # Static files
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `GET /api/auth/users` - Get all users

### Chat
- `GET /api/chat/history` - Get messages
- `POST /api/chat/message` - Send message
- `POST /api/chat/translate` - Translate text

## 🎨 Tech Stack

**Frontend:**
- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- Socket.IO Client
- React Select

**Backend:**
- Next.js API Routes
- MongoDB + Mongoose
- JWT Authentication
- bcryptjs

**Real-time:**
- Socket.IO
- WebRTC

## 📱 Usage

1. Register/Login with username, mobile number, and password
2. Select a contact from the list
3. Start chatting in your preferred language
4. Initiate video calls with the call button

## 🚢 Deployment

Deploy to Vercel:
```bash
vercel
```

Or push to GitHub and connect to Vercel/Netlify.

## 🤝 Contributing

Contributions are welcome! Please submit a Pull Request.

## 📄 License

MIT License

---

Made with ❤️ using Next.js