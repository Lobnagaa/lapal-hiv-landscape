import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the built bundle works from any folder on standard hosting
  // (Infomaniak included), not just the domain root.
  base: './',
  build: {
    outDir: 'dist',
    // hiv_dashboard_data.json is copied verbatim from public/ into dist/ and is
    // fetched at runtime, never bundled. A curator can overwrite it on the server.
    assetsDir: 'assets',
  },
})
