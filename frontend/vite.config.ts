import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from "rollup-plugin-visualizer";
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ['lithoscan-demo.loca.lt'],
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      "/api": { target: "http://127.0.0.1:5000", changeOrigin: true, secure: false, rewrite: (path) => path.replace(/^\/api/, ""), },
    }
  },
  preview: {
    host: true,
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})


