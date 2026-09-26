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

  it('nenhum arquivo do web usa uma classe ou variável de token removida (CA-02)', () => {
    const REMOVIDO =
      /\b(?:text|bg|border|ring|fill|stroke|from|via|to|shadow|outline|divide|decoration|accent|caret)-(?:magenta|ciano|vermelho-neon|painel-hover)\b|var\(--color-(?:magenta|ciano|vermelho-neon|painel-hover)\)|\bglow-[a-z]|\btint-(?:ouro|ciano|vermelho-neon)|\borb-(?:magenta|ciano)\b|\bcta-pulse\b|\bdot-blink\b/g;
    const usos = Object.entries(sources).flatMap(([file, source]) =>
      (source.match(REMOVIDO) ?? []).map((achado) => `${file}: ${achado}`),
    );

    expect(usos).toEqual([]);
  });

  it('nenhum arquivo do web volta ao visual antigo: cantos de 4 px, cores padrão do Tailwind ou maiúsculas espaçadas em botão (F4)', () => {
    const ANTIGO =
      /rounded-\[[34]px\]|\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|red|blue)-\d{2,3}\b|font-display[^"'`]*\buppercase\b[^"'`]*tracking-\[0\.1em\]/g;
    const usos = Object.entries(sources).flatMap(([file, source]) =>
      (source.match(ANTIGO) ?? []).map((achado) => `${file}: ${achado}`),
    );

    expect(usos).toEqual([]);
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
      'chek-corpo-1',
      'chek-corpo-2',
      'chek-base',
      'chek-mastro',
      'ouro-1',
      'ouro-2',
    ]) {
      expect(theme, `token --color-${token}`).toContain(`--color-${token}:`);
    }
    // Os tokens do tema neon saíram de vez (CA-01): nem alias sobrou.
    for (const removido of ['magenta', 'ciano', 'vermelho-neon', 'painel-hover', 'apagado']) {
      expect(theme, `token --color-${removido}`).not.toContain(`--color-${removido}:`);
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
    // O mascote Chek (CA-03): os seis tokens que o mestre em docs/design/marca usa e o tema ainda não tinha.
    expect(hexDoToken('chek-corpo-1')).toBe('#8fbaff');
    expect(hexDoToken('chek-corpo-2')).toBe('#3f79f0');
    expect(hexDoToken('chek-base')).toBe('#2a4fa3');
    expect(hexDoToken('chek-mastro')).toBe('#dfe8ff');
    expect(hexDoToken('ouro-1')).toBe('#ffe08a');
    expect(hexDoToken('ouro-2')).toBe('#ffbf47');
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

  it('sem as classes da linha antiga (.game-row, .row-hover, .game-title) (CA-13)', () => {
    expect(css).not.toMatch(/\.game-row|\.row-hover|\.game-title/);
  });

  it('o hover do tile só existe dentro de @media (hover: hover) (CA-18)', () => {
    // Do @media (hover: hover) até a próxima regra de mesmo nível: o que sobra fora dele não pode ter :hover do tile.
    const inicio = css.indexOf('@media (hover: hover)');
    const fim = css.indexOf('\n  }\n', inicio);
    const fora = css.slice(0, inicio) + css.slice(fim);
    expect(fora).not.toMatch(/\.tile:hover|\.tile:focus-within/);
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
  // Azul é o padrão (`acento`); as outras três só apontam para tokens da capa (nenhum hex novo).
  const DESTAQUES = { azul: 'acento', violeta: 'capa-6', rosa: 'capa-2', laranja: 'capa-3' };

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
  });

  it('não existem mais orbes, scanlines, pulso do botão, ponto piscando nem brilhos neon (CA-07)', () => {
    for (const nome of ['orb', 'scanlines', 'cta-pulse', 'dot-blink']) {
      expect(css, nome).not.toMatch(new RegExp(`\\.${nome}\\b`));
    }
    expect(css).not.toMatch(/\.glow-[a-z]/);
    for (const keyframe of ['drift', 'scan', 'neon-pulse', 'blink']) {
      expect(css, keyframe).not.toContain(`@keyframes ${keyframe}`);
    }
    expect(css).not.toMatch(/data-efeitos='reduzidos'\]\s*:is\(/);
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

describe('movimento reduzido nos botões que se elevam (CA-09)', () => {
  it('o hover:-translate-y de todo botão é desligado na mesma variante, pela propriedade `translate`', () => {
    const regra = css.match(/\[class\*='hover:-translate-y'\][^}]*\}\s*\}/)?.[0] ?? '';

    expect(regra).toContain('@variant movimento-reduzido');
    expect(regra).toContain('translate: none !important');
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

describe('estante: anel da nota e capa gerada (F2)', () => {
  it('as iniciais (fundo a 78%) têm >= 4,5:1 sobre cada cor da capa com o brilho de 28% (CA-41)', () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const misturar = (topo: string, base: string, alfa: number) =>
      '#' +
      rgb(topo)
        .map((c, i) => Math.round(c * alfa + (rgb(base)[i] as number) * (1 - alfa)))
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('');
    const medidos: number[] = [];

    for (const n of [1, 2, 3, 4, 5, 6]) {
      const capa = hexDoToken(`capa-${n}`);
      const comBrilho = misturar(hexDoToken('texto'), capa, 0.28);
      const iniciais = misturar(hexDoToken('fundo'), comBrilho, 0.78);
      medidos.push(contraste(iniciais, comBrilho));
    }

    expect(medidos).toHaveLength(6);
    for (const [i, valor] of medidos.entries()) {
      expect(valor, `capa-${i + 1}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o anel da média é um conic-gradient com o arco em `texto` e o trilho em color-mix do fundo (sem hex)', () => {
    const regra = css.match(/\.anel-nota\s*\{[^}]*\}/)?.[0] ?? '';

    expect(regra).toContain('conic-gradient');
    expect(regra).toContain('var(--color-texto)');
    expect(regra).toMatch(/color-mix\(in srgb, var\(--color-fundo\) 60%, transparent\)/);
  });

  it('a capa gerada tem brilho, anel e iniciais só com tokens', () => {
    for (const classe of ['capa-brilho', 'capa-anel', 'capa-iniciais']) {
      expect(css, classe).toContain(`.${classe} {`);
    }
    expect(css).toMatch(/\.capa-iniciais\s*\{[^}]*var\(--color-fundo\) 78%/);
  });
});
