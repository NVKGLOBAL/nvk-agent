import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Keep the heavy 3D + inference chunks lazy-loadable; do not inline everything.
    chunkSizeWarningLimit: 1500,
  },
});
