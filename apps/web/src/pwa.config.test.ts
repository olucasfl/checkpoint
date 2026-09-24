import { describe, expect, it } from 'vitest';
import css from '@/styles/index.css?raw';
import indexHtml from '../index.html?raw';
import { MANIFEST, pwaOptions } from '../pwa.config';

const FUNDO = /--color-fundo:\s*(#[0-9a-fA-F]{6})\s*;/.exec(css)?.[1];
const META_THEME = /<meta\s+name="theme-color"\s+content="([^"]+)"/.exec(indexHtml)?.[1];

describe('cor do tema (CA-34)', () => {
  it('lê o token --color-fundo do CSS (o teste não passa por não achar nada)', () => {
    expect(FUNDO).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('theme_color, background_color e <meta name="theme-color"> são iguais ao --color-fundo', () => {
    expect(MANIFEST.theme_color).toBe(FUNDO);
    expect(MANIFEST.background_color).toBe(FUNDO);
    expect(META_THEME).toBe(FUNDO);
  });
});

describe('manifest (CA-25)', () => {
  it('campos da spec', () => {
    expect(MANIFEST).toMatchObject({
      id: '/',
      name: 'checkpoint',
      short_name: 'checkpoint',
      description: 'Seu registro de jogos: zerados, jogando e quero jogar.',
      lang: 'pt-BR',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      categories: ['games', 'entertainment'],
    });
  });

  it('sem orientation (retrato e paisagem) e sem shortcuts (etapa 4)', () => {
    expect(MANIFEST).not.toHaveProperty('orientation');
    expect(MANIFEST).not.toHaveProperty('shortcuts');
  });

  it('ícones any e maskable em entradas separadas, nos caminhos definitivos', () => {
    const icons = MANIFEST.icons ?? [];

    expect(icons.map((icon) => [icon.src, icon.sizes, icon.purpose])).toEqual([
      ['/icons/icon-192.png', '192x192', 'any'],
      ['/icons/icon-512.png', '512x512', 'any'],
      ['/icons/icon-maskable-192.png', '192x192', 'maskable'],
      ['/icons/icon-maskable-512.png', '512x512', 'maskable'],
    ]);
    expect(icons.every((icon) => icon.purpose !== 'any maskable')).toBe(true);
  });
});

describe('service worker (workbox)', () => {
  it('modo prompt, registro pelo nosso código e sem SW no dev', () => {
    expect(pwaOptions.strategies).toBe('generateSW');
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.injectRegister).toBe(false);
    expect(pwaOptions.devOptions?.enabled).toBe(false);
  });

  it('nada em runtime: runtimeCaching vazio', () => {
    expect(pwaOptions.workbox?.runtimeCaching).toEqual([]);
  });

  it('a navegação offline cai no index.html, exceto /api/', () => {
    const workbox = pwaOptions.workbox;

    expect(workbox?.navigateFallback).toBe('index.html');
    const denylist = workbox?.navigateFallbackDenylist ?? [];
    expect(denylist.some((pattern) => pattern.test('/api/games'))).toBe(true);
    expect(denylist.some((pattern) => pattern.test('/status'))).toBe(false);
    expect(denylist.some((pattern) => pattern.test('/'))).toBe(false);
  });

  it('limpa caches antigos e NÃO ativa a versão nova sozinha', () => {
    const workbox = pwaOptions.workbox;

    expect(workbox?.cleanupOutdatedCaches).toBe(true);
    expect(workbox).not.toHaveProperty(['skip', 'Waiting'].join(''));
    expect(workbox).not.toHaveProperty('clientsClaim');
  });
});

describe('index.html', () => {
  it('não declara o manifest à mão (o plugin injeta no build)', () => {
    expect(indexHtml).not.toMatch(/rel="manifest"/);
  });

  it('metas e links da spec', () => {
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(indexHtml).toContain('href="/icons/apple-touch-icon-180.png"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-status-bar-style" content="black"');
  });
});
