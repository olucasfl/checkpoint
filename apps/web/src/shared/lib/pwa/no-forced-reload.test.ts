import { describe, expect, it } from 'vitest';

// Código do web, testes inclusive: nenhum arquivo pode conter os padrões abaixo.
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx,css,html}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const config = import.meta.glob<string>(['/pwa.config.ts', '/index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Montados por partes: escritos por inteiro, este arquivo se acusaria a si mesmo.
const FORBIDDEN = [
  ['con', 'firm('],
  ['skip', 'Waiting()'],
  ['controller', 'change'],
  ['location', '.reload'],
].map((parts) => parts.join(''));

describe('atualização só por clique do usuário (CA-35)', () => {
  it('a varredura enxerga o código (não passa por olhar o lugar errado)', () => {
    expect(Object.keys(sources).some((file) => file.endsWith('/main.tsx'))).toBe(true);
    expect(Object.keys(sources).some((file) => file.endsWith('/use-app-update.ts'))).toBe(true);
  });

  it.each(FORBIDDEN)('%s não aparece em apps/web/src, na config nem no index.html', (pattern) => {
    const offenders = Object.entries({ ...sources, ...config })
      .filter(([, source]) => source.includes(pattern))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});
