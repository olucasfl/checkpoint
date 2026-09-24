/**
 * `/?novo=1` abre o formulário de novo jogo (item "Adicionar" da barra inferior e, na etapa 4 da spec
 * pwa-e-mobile, o atalho do manifest). A página remove o parâmetro ao abrir, para um reload não
 * reabrir o formulário.
 */
export const NEW_GAME_PARAM = 'novo';

/**
 * Destino do "Adicionar": em `/`, mantém a query atual (o filtro `?status=` continua) e só acrescenta
 * `novo=1`; em qualquer outra rota, vai para `/?novo=1`.
 */
export function newGameHref(pathname: string, search: string): string {
  const params = new URLSearchParams(pathname === '/' ? search : '');
  params.set(NEW_GAME_PARAM, '1');
  return `/?${params.toString()}`;
}

/** A URL pede para abrir o formulário de novo jogo? */
export function wantsNewGame(params: URLSearchParams): boolean {
  return params.get(NEW_GAME_PARAM) === '1';
}

/** Os mesmos parâmetros, sem o `novo`. */
export function withoutNewGameParam(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(NEW_GAME_PARAM);
  return next;
}
