/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { resolve } from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Stub out Nexconn SDKs until the real packages are installed
      '@nexconn/chat': resolve(__dirname, 'src/lib/nexconn-chat-stub.ts'),
      '@nexconn/call': resolve(__dirname, 'src/lib/nexconn-call-stub.ts'),
    },
  },
  server: {
    host: '::',
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8080', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    testTimeout: 20000,
  },
})
