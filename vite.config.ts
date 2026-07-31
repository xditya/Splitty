/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    host: true,
    allowedHosts: true, // temp: allow the ngrok test domain through Vite's host check
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
