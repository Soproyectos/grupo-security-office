import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Destino del proxy de /api y /uploads: contenedor `api` por defecto; para trabajar en local
// contra otra API (p. ej. un tunel SSH) use VITE_API_TARGET=http://localhost:8080.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://api:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['srv-soporte.taila71364.ts.net', '100.87.48.41'],
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
