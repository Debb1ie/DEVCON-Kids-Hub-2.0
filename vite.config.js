import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist', 'docx']
  },
})
