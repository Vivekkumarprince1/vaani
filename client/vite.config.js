import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ✅ Code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@livekit') || id.includes('livekit-client')) return 'vendor-livekit';
            if (id.includes('socket.io-client')) return 'vendor-socket';
            if (id.includes('react-select') || id.includes('react-icons') || id.includes('@heroicons')) return 'vendor-ui';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom') || id.includes('axios')) return 'vendor-core';
            return 'vendor-other';
          }
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
