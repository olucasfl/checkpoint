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
    // 20 s (padrão 5 s): na máquina lenta (projeto no OneDrive) testes de tela com jsdom passavam de 5 s sob carga.
    testTimeout: 20_000,
    // A mesma folga para beforeEach/afterEach, que montam e desmontam as telas.
    hookTimeout: 20_000,
    // 4 forks fixos (padrão: núcleos − 1 = 15 aqui): com 15 jsdom de uma vez, o start dos workers estourava o tempo.
    maxWorkers: 4,
  },
});
