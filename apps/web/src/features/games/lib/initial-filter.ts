import { statusFilterToParams, type StatusFilter } from './status-filter';

/** Valor de `?status=` para "Todos" quando o filtro inicial é outro (qualquer valor desconhecido é Todos). */
export const TODOS_PARAM = 'TODOS';

/**
 * Abrir `/` SEM `?status=` (inclusive pelo item "Jogos") aplica o filtro inicial do /perfil: devolve
 * os parâmetros com `status`, ou `null` quando não há o que trocar (já tem `status`, ou o inicial é
 * Todos, que não leva parâmetro).
 */
export function comFiltroInicial(
  params: URLSearchParams,
  filtroInicial: StatusFilter,
): URLSearchParams | null {
  if (params.has('status') || filtroInicial === 'TODOS') {
    return null;
  }
  const next = new URLSearchParams(params);
  next.set('status', filtroInicial);
  return next;
}

/**
 * Parâmetros ao escolher um filtro. Com filtro inicial ≠ Todos, "Todos" precisa ficar na URL
 * (`?status=TODOS`); sem parâmetro, o filtro inicial seria aplicado de novo.
 */
export function paramsDoFiltro(
  filter: StatusFilter,
  filtroInicial: StatusFilter,
): Record<string, string> {
  if (filter === 'TODOS' && filtroInicial !== 'TODOS') {
    return { status: TODOS_PARAM };
  }
  return statusFilterToParams(filter);
}
