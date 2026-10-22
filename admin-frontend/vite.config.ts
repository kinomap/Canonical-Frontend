import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VITE_ADMIN_BASE_PATH || '/admin/',
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      'vue': fileURLToPath(new URL('./node_modules/vue/dist/vue.runtime.esm-bundler.js', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    fs: { allow: ['..'] },
    host: '0.0.0.0',
    hmr: process.env.ENVIRONMENT === 'local' ? {clientPort: 8888, path: '/hmr'} : undefined,
    port: 5174,
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
  }
})
