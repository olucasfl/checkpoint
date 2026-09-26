import { useEffect, useRef, useState } from 'react';
import { type Game } from '@checkpoint/shared';
import { useMovimentoReduzido } from '@/shared/hooks/use-movimento-reduzido';

export interface ItemDaPrateleira {
  game: Game;
  /** Uma cópia visual do jogo que acabou de sair: some sozinha em `ms` e não recebe cliques nem leitor de tela. */
  saindo: boolean;
}

interface Fantasma {
  game: Game;
  indice: number;
}

/**
 * Os jogos da prateleira, mais uma cópia visual de cada um que saiu (remover, ou mudar de status) por `ms`, na posição
 * em que estava, para o tile poder sumir suavemente antes de os vizinhos fecharem o espaço. O dado de verdade já mudou:
 * a lista, a contagem e as consultas por papel já não têm o jogo. Com movimento reduzido, nada é retido.
 */
export function useJogosComSaida(jogos: readonly Game[], ms: number): ItemDaPrateleira[] {
  const reduzido = useMovimentoReduzido();
  const anterior = useRef<readonly Game[]>(jogos);
  const montado = useRef(true);
  const [fantasmas, setFantasmas] = useState<readonly Fantasma[]>([]);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    const ids = new Set(jogos.map((jogo) => jogo.id));
    const removidos = anterior.current
      .map((game, indice) => ({ game, indice }))
      .filter(({ game }) => !ids.has(game.id));
    anterior.current = jogos;
    if (reduzido || removidos.length === 0) {
      return;
    }
    setFantasmas((atuais) => [...atuais, ...removidos]);
    // Sem cleanup de propósito: uma nova mudança da lista não pode deixar cópias presas na tela.
    setTimeout(() => {
      if (montado.current) {
        setFantasmas((atuais) => atuais.filter((item) => !removidos.includes(item)));
      }
    }, ms);
  }, [jogos, ms, reduzido]);

  const itens: ItemDaPrateleira[] = jogos.map((game) => ({ game, saindo: false }));
  [...fantasmas]
    .sort((a, b) => a.indice - b.indice)
    .forEach(({ game, indice }) => {
      if (!itens.some((item) => item.game.id === game.id)) {
        itens.splice(Math.min(indice, itens.length), 0, { game, saindo: true });
      }
    });
  return itens;
}
