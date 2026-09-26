import { describe, expect, it } from 'vitest';
import css from '@/styles/index.css?raw';

/** O corpo (entre chaves) de um bloco cujo cabeçalho casa com `inicio`, com as chaves aninhadas contadas. */
function corpo(fonte: string, inicio: RegExp): string[] {
  const achados: string[] = [];
  for (const match of fonte.matchAll(new RegExp(inicio, 'g'))) {
    let i = (match.index ?? 0) + match[0].length;
    const de = i;
    let nivel = 1;
    while (i < fonte.length && nivel > 0) {
      nivel += fonte[i] === '{' ? 1 : fonte[i] === '}' ? -1 : 0;
      i += 1;
    }
    achados.push(fonte.slice(de, i - 1));
  }
  return achados;
}

const PERMITIDAS = new Set(['transform', 'opacity', 'scale', 'translate', 'rotate']);
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => m[1] ?? '');
const declaracoesDeAnimacao = [...css.matchAll(/(?:^|\s)(animation|transition):\s*([^;]+);/g)];
const LACOS = new Set(['esqueleto-pulso', 'previa-elevar', 'chek-balanco', 'gira']);

describe('sistema de movimento (CA-13 a CA-17)', () => {
  it('os tokens de duração e de curva existem, com os valores da spec', () => {
    expect(css).toMatch(/--mov-rapida:\s*120ms;/);
    expect(css).toMatch(/--mov-padrao:\s*200ms;/);
    expect(css).toMatch(/--mov-enfase:\s*320ms;/);
    expect(css).toMatch(/--mov-max:\s*600ms;/);
    for (const curva of ['entrada', 'saida', 'elastica']) {
      expect(css).toMatch(new RegExp(String.raw`--ease-${curva}:\s*cubic-bezier\(`));
    }
  });

  it('nenhum feedback passa de --mov-max: as durações dos tokens de feedback cabem no teto', () => {
    const teto = Number(/--mov-max:\s*(\d+)ms/.exec(css)?.[1]);
    const feedback = ['rapida', 'padrao', 'enfase'].map((nome) =>
      Number(new RegExp(String.raw`--mov-${nome}:\s*(\d+)ms`).exec(css)?.[1]),
    );

    expect(feedback.every((ms) => ms > 0 && ms <= teto)).toBe(true);
  });

  it('nenhum animation ou transition usa duração ou curva literal (tudo passa pelos tokens)', () => {
    const soltos = declaracoesDeAnimacao
      .map((m) => m[2] ?? '')
      .filter(
        (valor) =>
          /\b\d*\.?\d+m?s\b/.test(valor) || /cubic-bezier|ease-in|ease-out|\blinear\b/.test(valor),
      )
      .filter((valor) => !/var\(--mov-/.test(valor));

    expect(soltos).toEqual([]);
  });

  it('cada @keyframes só anima transform, opacity, scale, translate e rotate', () => {
    const proibidas = corpo(css, /@keyframes\s+[\w-]+\s*\{/).flatMap((bloco) =>
      [...bloco.matchAll(/([a-z-]+)\s*:/g)]
        .map((m) => m[1] ?? '')
        .filter((p) => !PERMITIDAS.has(p)),
    );

    expect(proibidas).toEqual([]);
  });

  it('só os laços da espera repetem (infinite); o resto roda uma vez', () => {
    const laco = declaracoesDeAnimacao
      .filter((m) => m[1] === 'animation' && /\binfinite\b/.test(m[2] ?? ''))
      .map((m) => /^\s*([\w-]+)/.exec(m[2] ?? '')?.[1] ?? '');

    expect(laco.every((nome) => LACOS.has(nome))).toBe(true);
    expect(laco).toContain('esqueleto-pulso');
  });

  it('o tremor do campo com erro é UM ciclo, dentro de --mov-padrao (CA-33)', () => {
    expect(css).toMatch(/\.shake-error\s*\{[^}]*animation:\s*shake var\(--mov-padrao\)[^;]*\s1;/);
  });

  it('o brilho antigo do esqueleto (background-position) saiu', () => {
    expect(css).not.toContain('@keyframes shimmer');
    expect(css).not.toMatch(/background-position/);
  });

  it('a regra que zera animação e transição é UMA só, na variante movimento-reduzido', () => {
    const regras = css.match(/animation:\s*none\s*!important/g) ?? [];

    expect(regras).toHaveLength(1);
    expect(css).toMatch(
      /:where\(button, \[role='button'\], \.tile, nav a\):active\s*\{\s*@variant movimento-reduzido/,
    );
  });

  it('os laços da espera pausam com a aba oculta', () => {
    expect(css).toMatch(/html\[data-aba-oculta\][^{]*\{\s*animation-play-state:\s*paused/);
  });

  it('todo @keyframes tem um dono: usado em algum animation', () => {
    const usados = declaracoesDeAnimacao.map((m) => m[2] ?? '').join(' ');
    const orfaos = keyframes.filter((nome) => !usados.includes(nome));

    expect(orfaos).toEqual([]);
  });
});
