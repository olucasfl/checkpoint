import { type Plugin } from 'vite';

/**
 * O domínio de produção, num lugar só. O `index.html` escreve `%SITE_URL%` (o `og:image` e o `og:url` precisam de URL
 * absoluta) e o plugin abaixo troca pelo valor. Nenhum outro arquivo repete o domínio.
 */
export const SITE_URL = 'https://checkpoint-web-rust.vercel.app';

export const sitePlugin: Plugin = {
  name: 'checkpoint-site-url',
  // `pre`: antes de o Vite tratar `%NOME%` como variável de ambiente.
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
  },
};
