import { type Game, type GameStatus } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import { countByStatus, filterGames, padCount } from './count-by-status';

function game(id: string, status: GameStatus): Game {
  return {
    id,
    titulo: `Jogo ${id}`,
    plataforma: null,
    status,
    notas: {
      gameplay: null,
      historia: null,
      graficos: null,
      trilhaSonora: null,
      performance: null,
    },
    notaMedia: null,
    descricao: null,
    capaUrl: null,
    criadoEm: '2026-09-23T12:00:00.000Z',
    atualizadoEm: '2026-09-23T12:00:00.000Z',
  };
}

describe('countByStatus (CA-79)', () => {
  it('conta cada status e o total', () => {
    const games = [
      game('1', 'JOGANDO'),
      game('2', 'JOGANDO'),
      game('3', 'ZERADO'),
      game('4', 'QUERO_JOGAR'),
    ];

    expect(countByStatus(games)).toEqual({ total: 4, ZERADO: 1, JOGANDO: 2, QUERO_JOGAR: 1 });
  });

  it('lista vazia: tudo zero', () => {
    expect(countByStatus([])).toEqual({ total: 0, ZERADO: 0, JOGANDO: 0, QUERO_JOGAR: 0 });
  });

  it('acompanha criar, editar o status e remover (o exemplo do CA-79)', () => {
    let games = [game('1', 'JOGANDO'), game('2', 'JOGANDO'), game('3', 'ZERADO')];
    expect(countByStatus(games)).toMatchObject({ ZERADO: 1, JOGANDO: 2, QUERO_JOGAR: 0 });

    games = [...games, game('4', 'JOGANDO')]; // cria um Jogando
    expect(countByStatus(games)).toMatchObject({ ZERADO: 1, JOGANDO: 3 });

    games = games.map((g) => (g.id === '4' ? { ...g, status: 'ZERADO' as const } : g)); // edita
    expect(countByStatus(games)).toMatchObject({ ZERADO: 2, JOGANDO: 2 });

    games = games.filter((g) => g.id !== '4'); // remove
    expect(countByStatus(games)).toMatchObject({ ZERADO: 1, JOGANDO: 2 });
  });
});

describe('filterGames', () => {
  const games = [game('1', 'JOGANDO'), game('2', 'ZERADO'), game('3', 'JOGANDO')];

  it('TODOS devolve tudo, na ordem recebida', () => {
    expect(filterGames(games, 'TODOS').map((g) => g.id)).toEqual(['1', '2', '3']);
  });

  it('filtra por status preservando a ordem (CA-45)', () => {
    expect(filterGames(games, 'JOGANDO').map((g) => g.id)).toEqual(['1', '3']);
  });

  it('filtro sem resultado devolve lista vazia (CA-46)', () => {
    expect(filterGames(games, 'QUERO_JOGAR')).toEqual([]);
  });

  it('não muda a lista original', () => {
    const copy = [...games];
    filterGames(games, 'ZERADO');

    expect(games).toEqual(copy);
  });
});

describe('padCount', () => {
  it('mostra dois dígitos (01, 02...) e não corta números maiores', () => {
    expect(padCount(0)).toBe('00');
    expect(padCount(1)).toBe('01');
    expect(padCount(12)).toBe('12');
    expect(padCount(123)).toBe('123');
  });
});
