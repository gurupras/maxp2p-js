/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@gurupras/maxp2p': './src/index.js'
    }
  },
  plugins: [
    vue(),
    Components({
      resolvers: [IconsResolver()]
    }),
    Icons()
  ]
})
