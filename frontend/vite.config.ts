import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND_URL = 'http://127.0.0.1:8030'
const IDENTITY_HEADER = 'RStudio-Connect-Credentials'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const devUser = env.VITE_DEV_USER || 'vturano'
  // Posit Connect injects the identity header in production. Locally the dev
  // proxy plays that role so the backend sees the same shape of request.
  const identity = JSON.stringify({ user: devUser })
  const proxyTarget = {
    target: BACKEND_URL,
    changeOrigin: true,
    headers: { [IDENTITY_HEADER]: identity },
  }

  return {
    // Posit serves static content under /content/<guid>/, so every asset URL
    // must be relative to index.html. Hash routing keeps the document path fixed.
    base: './',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        '/api': proxyTarget,
        '/health': proxyTarget,
      },
    },
    preview: {
      port: 5175,
    },
  }
})
