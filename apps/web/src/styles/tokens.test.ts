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

const theme = css.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

/** O hex de um token, seguindo `var(--color-outro)` (alias) até achar o literal. Vazio se não achar. */
function hexDoToken(nome: string, vistos: string[] = []): string {
  if (vistos.includes(nome)) {
    return '';
  }
  const valor = theme.match(new RegExp(`--color-${nome}:\\s*([^;]+);`))?.[1]?.trim() ?? '';
  const alias = valor.match(/^var\(--color-([a-z0-9-]+)\)$/)?.[1];
  return alias
    ? hexDoToken(alias, [...vistos, nome])
    : /^#[0-9a-fA-F]{6}$/.test(valor)
      ? valor
      : '';
}

/** Contraste WCAG 2.x entre duas cores hex (a mesma fórmula das tabelas da spec). */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (bl as number);
  };
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro as number) + 0.05) / ((escuro as number) + 0.05);
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
      'painel-3',
      'acao-hover',
      'esqueleto',
      'borda',
      'borda-controle',
      'texto',
      'texto-suave',
      'apagado',
      'apagado-2',
      'acento',
      'destaque',
      'status-jogando',
      'status-quero-jogar',
      'status-zerado',
      'ouro',
      'erro',
      'erro-texto',
      'capa-1',
      'capa-2',
      'capa-3',
      'capa-4',
      'capa-5',
      'capa-6',
    ]) {
      expect(theme, `token --color-${token}`).toContain(`--color-${token}:`);
    }
    // Valores da tabela da spec `troca-de-design-estante`.
    expect(hexDoToken('fundo')).toBe('#0b0f1a');
    expect(hexDoToken('painel')).toBe('#121829');
    expect(hexDoToken('painel-2')).toBe('#0f1524');
    expect(hexDoToken('painel-3')).toBe('#1a2135');
    expect(hexDoToken('borda')).toBe('#1e2640');
    expect(hexDoToken('borda-controle')).toBe('#606a8e'); // o desenho trazia #3a4468 (1,86:1: reprova)
    expect(hexDoToken('texto')).toBe('#eef2ff');
    expect(hexDoToken('texto-suave')).toBe('#a3abc7');
    expect(hexDoToken('acento')).toBe('#4f8cff');
    expect(hexDoToken('status-jogando')).toBe('#7fb0ff');
    expect(hexDoToken('status-quero-jogar')).toBe('#ffd166');
    expect(hexDoToken('status-zerado')).toBe('#5ee6a8');
    expect(hexDoToken('ouro')).toBe('#ffd166');
    expect(hexDoToken('erro')).toBe('#ff4d6d');
    expect(hexDoToken('erro-texto')).toBe('#ff8fa3');
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
  it('o index.html carrega Outfit, Manrope e Material Symbols Rounded por <link>, com display=swap (CA-05)', () => {
    const links = indexHtml.match(/<link[^>]+>/g)?.join('\n') ?? '';

    expect(links).toContain('family=Outfit');
    expect(links).toContain('family=Manrope');
    expect(links).toContain('family=Material+Symbols+Rounded');
    expect(links).toContain('fonts.googleapis.com');
    expect(links).toContain('display=swap');
    expect(links).not.toContain('Orbitron');
    expect(links).not.toContain('Rajdhani');
  });

  it('--font-display é a Outfit e --font-corpo a Manrope, com system-ui de reserva (CA-06)', () => {
    expect(theme).toMatch(/--font-display:\s*'Outfit',\s*system-ui/);
    expect(theme).toMatch(/--font-corpo:\s*'Manrope',\s*system-ui/);
  });
});

describe('mobile-first (pwa-e-mobile, etapa 1)', () => {
  const viewport = indexHtml.match(/<meta\s+name="viewport"[\s\S]*?\/>/)?.[0] ?? '';

  it('viewport com viewport-fit=cover e sem travar o zoom (CA-12)', () => {
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).toContain('interactive-widget=resizes-content');
    expect(viewport).not.toMatch(/maximum-scale/);
    expect(viewport).not.toMatch(/user-scalable/);
  });

  it('#overlay-root existe, vem depois do #root e não está dentro dele (CA-15)', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
    const root = doc.getElementById('root');
    const overlay = doc.getElementById('overlay-root');

    expect(root).not.toBeNull();
    expect(overlay).not.toBeNull();
    expect(root?.contains(overlay)).toBe(false);
    expect(overlay?.parentElement).toBe(root?.parentElement);
    expect(root?.compareDocumentPosition(overlay as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('toque sem atraso e campos com fonte mínima de 16px (CA-11)', () => {
    expect(css).toMatch(/html\s*\{[^}]*touch-action:\s*manipulation/);
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px/);
  });

  it('hover da linha só em aparelho com hover (CA-14)', () => {
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.row-hover:hover/);
    expect(css.replace(/@media \(hover: hover\)\s*\{\s*\.row-hover:hover/, '')).not.toMatch(
      /\.row-hover:hover/,
    );
  });

  it('safe-area e 100dvh no layout, na barra inferior e na folha (CA-05, CA-08, CA-09)', () => {
    expect(css).toMatch(/\.app-shell\s*\{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh/);
    expect(css).toMatch(/\.nav-clearance\s*\{[^}]*env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.bottom-nav\s*\{[^}]*env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.safe-x\s*\{[^}]*env\(safe-area-inset-left\)/);
    expect(css).toMatch(/dialog\.modal\s*\{[^}]*env\(safe-area-inset-top\)/);
  });

  it('a subida da folha é uma animação, desligada pela regra global de movimento reduzido (CA-13)', () => {
    expect(css).toMatch(/dialog\.modal\s*\{[^}]*animation:\s*sheet-up/);
    expect(css).toContain('@keyframes sheet-up');
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*$/)?.[0] ?? '';
    expect(reduced).toMatch(
      /\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation:\s*none\s*!important/,
    );
  });

  it('o "puxar para atualizar" só é desligado no app instalado', () => {
    expect(css).toMatch(
      /@media \(display-mode: standalone\)\s*\{\s*body\s*\{[^}]*overscroll-behavior-y:\s*none/,
    );
  });
});

describe('cor de destaque e efeitos reduzidos (perfil, etapa 3)', () => {
  // Até o commit das novas cores (F1, commit 4) os valores gravados ainda são os antigos; `magenta` já é o acento novo.
  const DESTAQUES = { magenta: 'acento', violeta: 'capa-6', azul: 'capa-1', laranja: 'capa-3' };

  it('`destaque` só aponta para tokens que já existem no @theme (nenhum hex novo)', () => {
    expect(theme).toMatch(/--color-destaque:\s*var\(--color-acento\)/);
    for (const [valor, token] of Object.entries(DESTAQUES).slice(1)) {
      expect(css, valor).toMatch(
        new RegExp(
          `html\\[data-destaque='${valor}'\\]\\s*\\{\\s*--color-destaque:\\s*var\\(--color-${token}\\)`,
        ),
      );
    }
    const alvos = [...css.matchAll(/--color-destaque:\s*var\(--color-([a-z0-9-]+)\)/g)].map(
      (m) => m[1],
    );
    for (const token of alvos) {
      expect(hexDoToken(token as string), token).toMatch(/^#/);
    }
  });

  it.each(Object.entries(DESTAQUES))(
    'texto `fundo` sobre o destaque %s passa de 4,5:1 (CA-23)',
    (_valor, token) => {
      expect(contraste(hexDoToken('fundo'), hexDoToken(token))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('o "Limpar" da seção Avaliação (texto-suave sobre o cartão painel-2) passa de 4,5:1, e no hover (destaque) também', () => {
    const cartao = hexDoToken('painel-2');
    expect(contraste(hexDoToken('texto-suave'), cartao)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hexDoToken('destaque'), cartao)).toBeGreaterThanOrEqual(4.5);
    // A descrição curta e o "sem nota" usam o mesmo par, sobre o cartão e sobre o painel.
    expect(contraste(hexDoToken('texto-suave'), hexDoToken('painel'))).toBeGreaterThanOrEqual(4.5);
  });

  it('os efeitos "Reduzidos" estão na MESMA variante das regras de movimento (um seletor a mais)', () => {
    const variante = css.match(/@custom-variant movimento-reduzido\s*\{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(variante).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*@slot;/);
    expect(variante).toMatch(/:root\[data-efeitos='reduzidos'\] &\s*\{\s*@slot;/);
    expect(css).toMatch(
      /\*,\s*\*::before,\s*\*::after\s*\{\s*@variant movimento-reduzido\s*\{[^}]*animation:\s*none !important;[^}]*transition:\s*none !important/,
    );
    expect(css).toMatch(/\.cta-pulse\s*\{\s*@variant movimento-reduzido\s*\{[^}]*box-shadow/);
  });

  it('efeitos "Reduzidos" escondem orbes e scanlines (CA-18)', () => {
    expect(css).toMatch(
      /html\[data-efeitos='reduzidos'\]\s*:is\(\.orb,\s*\.scanlines\)\s*\{\s*display:\s*none/,
    );
  });

  it('nenhum pseudo-elemento anima: o ramo do atributo não os alcança', () => {
    const regras = [...css.matchAll(/([^{}]*::?(?:before|after)[^{}]*)\{([^{}]*)\}/g)];
    const animados = regras.filter(
      ([, seletor, corpo]) =>
        /animation|transition/.test(corpo as string) && !/\*::before/.test(seletor as string),
    );

    expect(animados.map(([, seletor]) => (seletor as string).trim())).toEqual([]);
  });
});

describe('contrastes da spec troca-de-design-estante (CA-03)', () => {
  const t = (nome: string) => hexDoToken(nome);
  const SUPERFICIES = ['fundo', 'painel', 'painel-2', 'painel-3'];

  it('todos os tokens que a spec usa como cor têm um hex resolvível', () => {
    for (const nome of [
      ...SUPERFICIES,
      'texto',
      'texto-suave',
      'acento',
      'destaque',
      'status-jogando',
      'status-quero-jogar',
      'status-zerado',
      'ouro',
      'erro',
      'erro-texto',
      'borda-controle',
      'capa-2',
      'capa-3',
      'capa-6',
    ]) {
      expect(t(nome), nome).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(SUPERFICIES.flatMap((s) => ['texto', 'texto-suave'].map((f) => [f, s])))(
    '%s sobre %s passa de 4,5:1',
    (frente, fundo) => {
      expect(contraste(t(frente as string), t(fundo as string))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    'destaque',
    'status-jogando',
    'status-quero-jogar',
    'status-zerado',
    'ouro',
    'erro',
    'erro-texto',
  ])('%s como texto ou ícone sobre painel passa de 4,5:1', (token) => {
    expect(contraste(t(token), t('painel'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['acento', 'capa-6', 'capa-2', 'capa-3'])(
    'texto `fundo` sobre o preenchimento %s (as quatro cores de destaque) passa de 4,5:1 (CA-60)',
    (token) => {
      expect(contraste(t('fundo'), t(token))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('o texto claro sobre o acento NÃO passa (por isso o botão principal leva texto `fundo`)', () => {
    expect(contraste(t('texto'), t('acento'))).toBeLessThan(4.5);
  });

  it.each(['fundo', 'painel', 'painel-2'])(
    'borda-controle sobre %s passa de 3:1 (WCAG 1.4.11)',
    (superficie) => {
      expect(contraste(t('borda-controle'), t(superficie))).toBeGreaterThanOrEqual(3);
    },
  );

  it('a borda decorativa e o apagado-2 NÃO servem de contorno de controle nem de texto (ficam abaixo do mínimo)', () => {
    expect(contraste(t('borda'), t('painel'))).toBeLessThan(3);
    expect(contraste(t('apagado-2'), t('painel'))).toBeLessThan(4.5);
  });
});
