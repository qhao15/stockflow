import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser tests set these, to run next to npm run dev (see playwright.config.js).
const { API_URL = 'http://localhost:5000', VITE_CACHE_DIR } = process.env;

export default defineConfig({
  plugins: [react()],
  cacheDir: VITE_CACHE_DIR,
  server: {
    port: 5173,
    proxy: {
      '/api': API_URL,
    },
  },
});
