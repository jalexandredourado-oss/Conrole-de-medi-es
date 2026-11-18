import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    '__IS_STANDALONE_BUILD__': JSON.stringify(true),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname ?? '.', '.'),
    },
  },
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
  },
});
