import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ✅ Code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'livekit': ['@livekit/components-react', 'livekit-client'],
          'socket': ['socket.io-client'],
          'vendor': ['react', 'react-dom', 'react-router-dom', 'axios'],
        }
      }
    },
    // ✅ Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true
      }
    },
    // ✅ Source maps for debugging (can be disabled for smaller bundle)
    sourcemap: false,
    // ✅ Generate CSS separately
    cssCodeSplit: true,
    // ✅ Optimize chunk sizes
    chunkSizeWarningLimit: 600,
    // ✅ Report compressed sizes
    reportCompressedSize: true,
  },
  server: {
    // ✅ Development server config
    port: 5173,
    strictPort: false,
    open: true,
  },
  preview: {
    // ✅ Preview production build locally
    port: 4173,
    strictPort: false,
  }
})
