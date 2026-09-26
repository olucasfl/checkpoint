import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { SITE_URL, sitePlugin } from '../site.config';

const fontes = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('index.html: metas de compartilhamento (CA-08)', () => {
  it('descrição, Open Graph, Twitter e favicon.ico', () => {
    expect(indexHtml).toContain('name="description"');
    expect(indexHtml).toContain('property="og:title"');
    expect(indexHtml).toContain('property="og:description"');
    expect(indexHtml).toContain('property="og:type"');
    expect(indexHtml).toContain('property="og:image" content="%SITE_URL%/og-image-1200x630.png"');
    expect(indexHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.ico" sizes="48x48" />');
    expect(indexHtml).toContain('name="apple-mobile-web-app-title" content="Checkpoint"');
  });

  it('o plugin troca %SITE_URL% pela URL absoluta de produção', () => {
    const handler = (sitePlugin.transformIndexHtml as { handler: (html: string) => string })
      .handler;
    const html = handler(indexHtml);

    expect(html).toContain(`content="${SITE_URL}/og-image-1200x630.png"`);
    expect(html).not.toContain('%SITE_URL%');
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  it('o domínio aparece só em site.config.ts (nem no index.html, nem no src)', () => {
    const host = new URL(SITE_URL).host;

    expect(indexHtml).not.toContain(host);
    expect(Object.entries(fontes).filter(([, fonte]) => fonte.includes(host))).toEqual([]);
  });
});
