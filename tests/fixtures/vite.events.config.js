import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [{
    name: 'mock-events-app-state',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '../context/AppState' && importer?.replaceAll('\\', '/').includes('/src/')) {
        return fileURLToPath(new URL('./mock-app-state.jsx', import.meta.url));
      }
      if (source === './AIChat' && importer?.replaceAll('\\', '/').endsWith('/src/components/Layout.jsx')) {
        return fileURLToPath(new URL('./mock-ai-chat.jsx', import.meta.url));
      }
      return null;
    }
  }, react()],
  server: { hmr: false },
});
