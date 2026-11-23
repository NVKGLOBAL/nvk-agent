import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    // Keep the heavy 3D + inference chunks lazy-loadable; do not inline everything.
    chunkSizeWarningLimit: 1500,
  },
});
