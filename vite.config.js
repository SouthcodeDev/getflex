import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    cors: true,
  },

  build: {
    rollupOptions: {
      input: resolve(__dirname, 'src/main.js'),
      output: {
        entryFileNames: 'main.js',
        format: 'iife',
        dir: resolve(__dirname, 'dist'),
      },
    },
    minify: 'terser',
  },
});
