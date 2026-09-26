import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwaPlugin } from './pwa.config';
import { sitePlugin } from './site.config';

export default defineConfig({
  plugins: [react(), tailwindcss(), sitePlugin, pwaPlugin],
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
  // No build de producao o Rollup so converte CommonJS que esta em node_modules; o shared e linkado
  // (o caminho real fica em packages/), entao sem isto ele nao enxerga os exports do dist/.
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages[\\/]shared[\\/]dist/],
    },
  },
  server: {
    port: 5173,
  },
});
