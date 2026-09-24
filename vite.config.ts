import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : process.env.BASE_PATH || '/csgo-web/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  server: { port: 5173 },
}));
