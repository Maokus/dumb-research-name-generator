import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Set base so the generated index.html references assets relative to the
  // published path on maok.us: https://maok.us/playbox/projects/rng/
  base: '/playbox/projects/rng/',
  plugins: [react()],
})
