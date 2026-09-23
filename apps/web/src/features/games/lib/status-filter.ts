import { GAME_STATUS, type GameStatus } from '@checkpoint/shared';

/** Filtro da lista: um status, ou TODOS (sem parâmetro na URL). */
export type StatusFilter = GameStatus | 'TODOS';

/** Ordem dos botões de filtro na tela (spec: Todos, Jogando, Quero jogar, Zerado). */
export const FILTER_ORDER: readonly StatusFilter[] = ['TODOS', 'JOGANDO', 'QUERO_JOGAR', 'ZERADO'];

/** Lê `?status=` da URL. Ausente ou inválido vira TODOS: um valor desconhecido não quebra a tela. */
export function parseStatusFilter(param: string | null): StatusFilter {
  return (GAME_STATUS as readonly string[]).includes(param ?? '') ? (param as GameStatus) : 'TODOS';
}

/** Parâmetros de busca para um filtro: TODOS não leva parâmetro. */
export function statusFilterToParams(filter: StatusFilter): Record<string, string> {
  return filter === 'TODOS' ? {} : { status: filter };
}
