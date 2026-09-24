import { describe, expect, it } from 'vitest';
import css from '@/styles/index.css?raw';

const KEYFRAMES = /@keyframes\s+([\w-]+)/g;

const names = (source: string) => [...source.matchAll(KEYFRAMES)].map((match) => match[1] ?? '');

// Animações que o Tailwind 4 emite no CSS (theme.css dele): um @keyframes nosso com um destes nomes é
// sobrescrito por ele.
const TAILWIND_NAMES = new Set(['pulse', 'spin', 'ping', 'bounce']);

describe('nomes de @keyframes do index.css', () => {
  it('nenhum @keyframes tem nome de animação do Tailwind (pulse, spin, ping, bounce…)', () => {
    // Com o mesmo nome, o Tailwind emite o dele DEPOIS do nosso e o minificador do build fica só
    // com o último: o brilho neon do botão virava um piscar de opacidade.
    const collisions = names(css).filter((name) => TAILWIND_NAMES.has(name));

    expect(collisions).toEqual([]);
  });

  it('toda animação declarada no index.css usa um @keyframes que existe nele', () => {
    const defined = new Set(names(css));
    const used = [...css.matchAll(/animation:\s*([^;]+);/g)].flatMap((match) =>
      (match[1] ?? '')
        .split(/[\s,]+/)
        .filter(
          (token) =>
            /^[a-z][\w-]*$/.test(token) && !/^(ease|linear|infinite|steps|none)/.test(token),
        ),
    );
    const keyframeRefs = used.filter((token) => defined.has(token) || TAILWIND_NAMES.has(token));

    expect(keyframeRefs.filter((token) => !defined.has(token))).toEqual([]);
  });
});
