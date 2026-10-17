import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { target: ['chrome109', 'safari15'] },
  plugins: [react()],
})
