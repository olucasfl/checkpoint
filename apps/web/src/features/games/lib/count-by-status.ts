import { type Game, type GameStatus } from '@checkpoint/shared';
import { type StatusFilter } from './status-filter';

export type StatusCounts = Record<GameStatus, number> & { total: number };

/**
 * Contagens dos painéis e dos filtros, derivadas da lista COMPLETA (uma única query): assim ficam
 * certas depois de criar, editar ou remover, sem endpoint novo.
 */
export function countByStatus(games: readonly Game[]): StatusCounts {
  const counts: StatusCounts = { total: games.length, ZERADO: 0, JOGANDO: 0, QUERO_JOGAR: 0 };

  for (const game of games) {
    counts[game.status] += 1;
  }

  return counts;
}

/** Aplica o filtro no cliente, preservando a ordem que a API mandou. */
export function filterGames(games: readonly Game[], filter: StatusFilter): Game[] {
  return filter === 'TODOS' ? [...games] : games.filter((game) => game.status === filter);
}

/** Painéis mostram dois dígitos ("01"); o número simples vai no `aria-label`. */
export function padCount(count: number): string {
  return String(count).padStart(2, '0');
}
