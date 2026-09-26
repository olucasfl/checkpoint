import { act, renderHook } from '@testing-library/react';
import { type Game } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJogosComSaida } from './use-jogos-com-saida';

const reduzido = vi.hoisted(() => ({ valor: false }));
vi.mock('@/shared/hooks/use-movimento-reduzido', () => ({
  useMovimentoReduzido: () => reduzido.valor,
}));

const jogo = (id: string): Game => ({
  id,
  titulo: `Jogo ${id}`,
  plataforma: null,
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
});

describe('useJogosComSaida (CA-52, CA-58)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reduzido.valor = false;
  });
  afterEach(() => vi.useRealTimers());

  it('o jogo removido volta como cópia "saindo", na mesma posição, e some depois de ms', () => {
    const [a, b, c] = [jogo('a'), jogo('b'), jogo('c')] as [Game, Game, Game];
    const { result, rerender } = renderHook(({ jogos }) => useJogosComSaida(jogos, 200), {
      initialProps: { jogos: [a, b, c] },
    });
    expect(result.current.map((i) => [i.game.id, i.saindo])).toEqual([
      ['a', false],
      ['b', false],
      ['c', false],
    ]);

    rerender({ jogos: [a, c] });

    expect(result.current.map((i) => [i.game.id, i.saindo])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.map((i) => i.game.id)).toEqual(['a', 'c']);
  });

  it('com movimento reduzido a remoção é instantânea (nenhuma cópia)', () => {
    reduzido.valor = true;
    const [a, b] = [jogo('a'), jogo('b')] as [Game, Game];
    const { result, rerender } = renderHook(({ jogos }) => useJogosComSaida(jogos, 200), {
      initialProps: { jogos: [a, b] },
    });

    rerender({ jogos: [a] });

    expect(result.current.map((i) => i.game.id)).toEqual(['a']);
  });

  it('a primeira renderização e a lista que só cresce não criam cópias', () => {
    const [a, b] = [jogo('a'), jogo('b')] as [Game, Game];
    const { result, rerender } = renderHook(({ jogos }) => useJogosComSaida(jogos, 200), {
      initialProps: { jogos: [a] },
    });

    rerender({ jogos: [b, a] });

    expect(result.current.every((i) => !i.saindo)).toBe(true);
  });
});
