# Client Configuration Guide

## Environment Variables

### Development (.env)
```
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
VITE_NODE_ENV=development
VITE_USE_LIVEKIT_AUDIO_TRACKS=false
```

### Production (Render)
For Render deployment, set these environment variables in the Render dashboard:

```
VITE_API_URL=https://your-backend-url.onrender.com/api
VITE_SOCKET_URL=wss://your-backend-url.onrender.com
VITE_NODE_ENV=production
VITE_USE_LIVEKIT_AUDIO_TRACKS=false
```

## Centralized Configuration

All API URLs are now managed through `src/config/api.js`. This file:
- Reads environment variables from `.env`
- Automatically converts protocols (http→ws, https→wss for Socket.IO)
- Exposes feature flags globally
- Detects development vs production mode

**Usage:**
```javascript
import { config } from '../config/api';

console.log(config.API_URL);        // http://localhost:3001/api
console.log(config.SOCKET_URL);     // ws://localhost:3001
console.log(config.isDevelopment);  // true in dev
console.log(config.isProduction);   // true in prod
```

## Build & Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

The build process includes:
- ✅ Code splitting (vendor, socket.io, livekit chunks)
- ✅ Minification with Terser
- ✅ Console log removal in production
- ✅ CSS code splitting
- ✅ Source map generation (disabled for smaller bundle)

### Preview Production Build Locally
```bash
npm run build && npm run preview
```

## Error Handling

### Error Boundary
The app is wrapped with an `ErrorBoundary` component that:
- Catches React errors
- Displays fallback UI
- Shows error details in development mode
- Provides recovery option (refresh page)

Located in: `src/components/ErrorBoundary.jsx`

## Health Checks

### Backend Health Check Hook
Use `useHealthCheck()` to verify backend connectivity:

```javascript
import useHealthCheck from '../hooks/useHealthCheck';

function MyComponent() {
  const { backendHealthy, checking } = useHealthCheck();
  
  if (checking) return <p>Checking backend...</p>;
  if (!backendHealthy) return <p>Backend unavailable</p>;
  
  return <p>Connected!</p>;
}
```

## Production Checklist

- [ ] Set `VITE_NODE_ENV=production`
- [ ] Update `VITE_API_URL` to production backend URL
- [ ] Update `VITE_SOCKET_URL` to production backend URL (with `wss://`)
- [ ] Run `npm run build` and verify no errors
- [ ] Test in `npm run preview` before deploying
- [ ] Add to Vercel/Render environment variables
- [ ] Verify backend health check passes
- [ ] Test Socket.IO connection in DevTools Network tab
- [ ] Monitor errors via browser console and error boundary

## Debugging

### Socket.IO Issues
1. Check DevTools Network → WS tab
2. Verify protocol: `ws://` (dev) or `wss://` (prod)
3. Check CORS headers match backend `ALLOWED_ORIGINS`

### API Issues
1. Check DevTools Network → XHR tab
2. Verify `VITE_API_URL` matches backend domain
3. Check CORS headers in response

### Environment Variables Not Loading
1. Restart dev server after changing `.env`
2. Verify variable names start with `VITE_`
3. Check `.env` is in client root directory

## Files Modified

- ✅ `src/config/api.js` - Centralized config
- ✅ `src/contexts/AuthContext.jsx` - Uses centralized config
- ✅ `src/contexts/TranslationContext.jsx` - Uses centralized config
- ✅ `src/utils/socketManager.js` - Uses centralized config + increased max attempts
- ✅ `src/App.jsx` - Removed debug logs
- ✅ `src/main.jsx` - Added ErrorBoundary
- ✅ `src/components/ErrorBoundary.jsx` - New component
- ✅ `src/hooks/useHealthCheck.js` - New hook
- ✅ `vite.config.js` - Added production optimizations
- ✅ `.env` - Fixed port to 3001
- ✅ `.env.example` - Updated with prod examples
