import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useMovimentoReduzido } from './use-movimento-reduzido';

/** Lê um token de movimento do :root (a duração e a curva não ficam soltas no JS). */
function lerToken(nome: string, padrao: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valor || padrao;
}

/**
 * FLIP: quando a ordem ou o conjunto dos filhos com `data-flip-id` muda (`chave`), cada filho que mudou de lugar desliza
 * do lugar antigo para o novo (`transform`, na duração `--mov-padrao`). É só visual: o DOM já está na posição final, e
 * nada bloqueia clique. Sem movimento (reduzido ou sem a Web Animations API), não faz nada.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, chave: string): void {
  const reduzido = useMovimentoReduzido();
  const posicoes = useRef(new Map<string, { x: number; y: number }>());
  const chaveAnterior = useRef(chave);

  useLayoutEffect(() => {
    const lista = ref.current;
    if (!lista) {
      return;
    }
    const filhos = [...lista.querySelectorAll<HTMLElement>('[data-flip-id]')];
    const agora = new Map<string, { x: number; y: number }>();
    filhos.forEach((filho) =>
      agora.set(filho.dataset.flipId ?? '', { x: filho.offsetLeft, y: filho.offsetTop }),
    );

    if (!reduzido && chaveAnterior.current !== chave) {
      const duration = parseFloat(lerToken('--mov-padrao', '200ms'));
      const easing = lerToken('--ease-entrada', 'ease-out');
      filhos.forEach((filho) => {
        const id = filho.dataset.flipId ?? '';
        const antes = posicoes.current.get(id);
        const depois = agora.get(id);
        if (!antes || !depois || typeof filho.animate !== 'function') {
          return;
        }
        const dx = antes.x - depois.x;
        const dy = antes.y - depois.y;
        if (dx !== 0 || dy !== 0) {
          filho.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration,
            easing,
          });
        }
      });
    }

    chaveAnterior.current = chave;
    posicoes.current = agora;
  });
}
