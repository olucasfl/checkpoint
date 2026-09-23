import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // @checkpoint/shared e um pacote linkado do monorepo e emite CommonJS;
  // pre-bundlar garante que o dev server resolva os imports corretamente.
  optimizeDeps: {
    include: ['@checkpoint/shared'],
  },
  server: {
    port: 5173,
  },
});
