/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fileURLToPath from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      'vue': path.resolve(__dirname, './node_modules/vue/dist/vue.runtime.esm-bundler.js'),
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    fs: { allow: ['..'] },
    host: '0.0.0.0',
    hmr: process.env.ENVIRONMENT === 'local' ? {clientPort: 8888, path: '/hmr-public'} : undefined,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true
      },
      '/media': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true
      }
    }
  },
  test: {
    globals: true,
    setupFiles: ['./src/tests/localeSetup.ts'],
    environment: 'jsdom'
  }
})
