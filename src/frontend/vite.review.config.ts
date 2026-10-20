// Vista de revisión de gs-tanda-01; la API de prueba escucha en :3001.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '100.87.48.41',
    allowedHosts: ['localhost', '127.0.0.1', 'srv-soporte.taila71364.ts.net', '100.87.48.41'],
    port: 5180,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
})
