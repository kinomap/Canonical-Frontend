/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import fileURLToPath from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    vue(),
    // Next-Gen TV portal on 2017–2020 TVs (Tizen 3–5, webOS 4–5, older Android TV WebViews):
    // browsers without ES modules get a nomodule SystemJS bundle with polyfills.
    // 2012–2016 TVs (Orsay, Netcast) are routed to the ES5 Lite portal (/tv/lite) instead.
    legacy({
      targets: ['chrome >= 47', 'safari >= 10'],
      modernTargets: ['edge >= 79', 'firefox >= 67', 'chrome >= 64', 'safari >= 12', 'chromeAndroid >= 64', 'ios >= 12'],
    }),
  ],
  build: {
    cssTarget: 'chrome64'
  },
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
