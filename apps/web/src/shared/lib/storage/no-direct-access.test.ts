import { describe, expect, it } from 'vitest';

// Todo o código-fonte do web, testes inclusive.
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('armazenamento local só por shared/lib/storage (CA-17)', () => {
  it('as palavras localStorage e sessionStorage só aparecem dentro de shared/lib/storage/', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.includes('/src/shared/lib/storage/'))
      .filter(([, source]) => /localStorage|sessionStorage/.test(source))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });

  it('a varredura enxerga o próprio módulo (não passa por estar olhando para o lugar errado)', () => {
    const inside = Object.entries(sources).filter(([file]) =>
      file.includes('/src/shared/lib/storage/'),
    );

    expect(inside.length).toBeGreaterThan(3);
    expect(inside.some(([, source]) => source.includes('window.localStorage'))).toBe(true);
  });
});
