import { VitePWA, type ManifestOptions, type VitePWAOptions } from 'vite-plugin-pwa';

/**
 * O manifest não lê CSS: este hex e o do `<meta name="theme-color">` repetem o token `fundo` de
 * `src/styles/index.css`, e `pwa.config.test.ts` confere que os três são iguais.
 */
const FUNDO = '#0b0f1a';

const ICONES = '/icons';

export const MANIFEST: Partial<ManifestOptions> = {
  id: '/',
  name: 'Checkpoint',
  short_name: 'Checkpoint',
  description: 'Seu registro de jogos: zerados, jogando e quero jogar.',
  lang: 'pt-BR',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  // Sem `orientation`: retrato e paisagem.
  theme_color: FUNDO,
  background_color: FUNDO,
  categories: ['games', 'entertainment'],
  // Sem `icons` nos atalhos: os PNGs de 96 px são opcionais e não existem; o Android usa o do app.
  shortcuts: [
    { name: 'Adicionar jogo', url: '/?novo=1' },
    { name: 'Jogando', url: '/?status=JOGANDO' },
  ],
  // `any` e `maskable` em entradas separadas: um ícone "any maskable" é recortado pela máscara e
  // perde as bordas, ou fica com fundo sobrando quando mostrado como `any`.
  icons: [
    { src: `${ICONES}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${ICONES}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: `${ICONES}/icon-maskable-192.png`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: `${ICONES}/icon-maskable-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

/** Exportado à parte do plugin para o teste conferir a configuração (o plugin não a expõe). */
export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: 'generateSW',
  registerType: 'prompt',
  // O registro é feito por `shared/lib/pwa/use-app-update.ts`, não por um script injetado.
  injectRegister: false,
  manifest: MANIFEST,
  includeAssets: ['icons/*.png', 'favicon.svg', 'favicon.ico'],
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
    // A imagem de compartilhamento (355 KB) só é pedida por robôs de rede social; no precache seria peso sem uso.
    globIgnores: ['og-image-*.png'],
    navigateFallback: 'index.html',
    // Defensivo: se a API um dia vier para a mesma origem, a navegação a ela não vira o shell.
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    // Nada em runtime: nem API, nem fontes, nem capas. Offline só o shell.
    runtimeCaching: [],
    // Sem ativação imediata do SW novo (modo prompt): ele só assume quando o usuário clica em
    // Atualizar; senão a página mudaria de versão no meio de um formulário.
  },
  // Sem SW no `npm run dev`: só se verifica com build + preview.
  devOptions: { enabled: false },
};

export const pwaPlugin = VitePWA(pwaOptions);
