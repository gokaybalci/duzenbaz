import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the built app works from any folder or static host.
export default defineConfig({
  base: './',
  // Desktop engines: WebView2 (Chromium) on Windows, WebKitGTK on Linux. Conservative targets keep
  // older WebKitGTK versions from distribution packages working too.
  build: { target: ['chrome109', 'safari15'] },
  plugins: [react()],
})
