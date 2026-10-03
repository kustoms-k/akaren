import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// One env file for the whole app: server/.env (see server/.env.example).
// Parsed directly instead of via Vite's loadEnv: that would also pick up the server's
// NODE_ENV=development and make production builds ship React's development build.
const ENV_FILE = new URL('../server/.env', import.meta.url);
const fileEnv = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
const env = (key) => process.env[key] ?? fileEnv[key];

export default defineConfig(({ command }) => {
  const apiTarget = env('VITE_API_TARGET');
  if (command === 'serve' && !apiTarget) {
    throw new Error('VITE_API_TARGET is not set. Copy server/.env.example to server/.env.');
  }

  return {
    plugins: [tailwindcss(), react()],
    server: {
      // 0.0.0.0 so a phone on the same Wi-Fi can open driver links.
      host: env('HOST') || '0.0.0.0',
      port: Number(env('VITE_PORT')) || 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
