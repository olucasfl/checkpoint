import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Config separada de vite.config.ts: os testes nao precisam do plugin do Tailwind nem do dev server.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Por padrão o Vitest devolve string vazia para CSS; o tokens.test.ts precisa ler o index.css.
    css: { include: [/styles[\\/]index\.css/] },
  },
});
