import { describe, expect, it } from 'vitest';
import css from '@/styles/index.css?raw';
import indexHtml from '../../index.html?raw';

// Todo o código-fonte do web, menos os próprios testes: é onde um hex não pode aparecer.
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx,css}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** Remove o bloco `@theme { ... }`, o único lugar autorizado a ter hex. */
function withoutTheme(source: string): string {
  return source.replace(/@theme\s*\{[\s\S]*?\n\}/, '');
}

describe('tokens de cor (CA-87)', () => {
  it('não há nenhum literal hexadecimal fora do bloco @theme', () => {
    const offenders = Object.entries(sources).flatMap(([file, source]) => {
      const matches = withoutTheme(source).match(HEX) ?? [];
      return matches.map((hex) => `${file}: ${hex}`);
    });

    expect(offenders).toEqual([]);
  });

  it('o @theme existe e declara os tokens da spec', () => {
    const theme = css.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

    for (const token of [
      'fundo',
      'painel',
      'painel-2',
      'painel-hover',
      'acao-hover',
      'esqueleto',
      'borda',
      'borda-controle',
      'texto',
      'texto-suave',
      'apagado',
      'apagado-2',
      'magenta',
      'ciano',
      'lima',
      'ambar',
      'erro',
      'capa-1',
      'capa-6',
    ]) {
      expect(theme, `token --color-${token}`).toContain(`--color-${token}:`);
    }
    expect(theme).toContain('#796ca0'); // borda-controle, calculado na spec
  });
});

describe('movimento reduzido (CA-84)', () => {
  it('existe a regra @media (prefers-reduced-motion: reduce) desligando animações e transições', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/)?.[0] ?? '';

    expect(block).not.toBe('');
    expect(block).toMatch(/animation:\s*none\s*!important/);
    expect(block).toMatch(/transition:\s*none\s*!important/);
  });

  it('o botão principal mantém um brilho estático quando o pulso sai', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/)?.[0] ?? '';

    expect(block).toMatch(/\.cta-pulse\s*\{[^}]*box-shadow/);
  });
});

describe('fontes e ícones (CA-88)', () => {
  it('o index.html carrega Orbitron, Rajdhani e Material Symbols Rounded por <link>', () => {
    const links = indexHtml.match(/<link[^>]+>/g)?.join('\n') ?? '';

    expect(links).toContain('family=Orbitron');
    expect(links).toContain('family=Rajdhani');
    expect(links).toContain('family=Material+Symbols+Rounded');
    expect(links).toContain('fonts.googleapis.com');
  });
});
