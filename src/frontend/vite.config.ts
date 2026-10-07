import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['srv-soporte.taila71364.ts.net', '100.87.48.41'],
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://api:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://api:3000',
        changeOrigin: true,
      },
    },
  },
})
