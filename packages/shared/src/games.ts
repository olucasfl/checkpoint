/**
 * Contrato do catalogo de jogos, consumido pela API e pelo web.
 * Codigo puro: sem `window`, sem Node, sem `@prisma/client` (ARCHITECTURE.md §6).
 */

/**
 * Codigos de status, sem espaco e sem acento. O texto de tela ("Quero jogar")
 * vive so no web; o contrato, o Prisma e a API usam estes codigos.
 */
export const GAME_STATUS = ['ZERADO', 'JOGANDO', 'QUERO_JOGAR'] as const;
export type GameStatus = (typeof GAME_STATUS)[number];

export const GAME_TITLE_MAX_LENGTH = 120;
export const GAME_PLATFORM_MAX_LENGTH = 60;
export const GAME_RATING_MIN = 0;
export const GAME_RATING_MAX = 10;

/** Jogo como a API o devolve. `plataforma` e `nota` sao `null` quando ausentes. */
export interface Game {
  id: string;
  titulo: string;
  plataforma: string | null;
  status: GameStatus;
  nota: number | null;
  /** ISO 8601. */
  criadoEm: string;
  /** ISO 8601. */
  atualizadoEm: string;
}

/** Corpo de `POST /api/games`. */
export interface CreateGameRequest {
  titulo: string;
  status: GameStatus;
  plataforma?: string | null;
  nota?: number | null;
}

/**
 * Corpo de `PATCH /api/games/:id`: ao menos um campo. So `plataforma` e `nota`
 * aceitam `null` (removem o valor); `titulo` e `status` nao.
 */
export interface UpdateGameRequest {
  titulo?: string;
  status?: GameStatus;
  plataforma?: string | null;
  nota?: number | null;
}

/** Query de `GET /api/games`. */
export interface ListGamesQuery {
  status?: GameStatus;
}

/** Campos de formulario que um erro 400/409 pode apontar. */
export type ApiErrorField = 'titulo' | 'plataforma' | 'status' | 'nota';

/** Formato dos erros 400 e 409 (o 404 traz so `statusCode` e `message`). */
export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  fields?: Partial<Record<ApiErrorField, string>>;
}

/**
 * Regra da nota: so existe quando o status FINAL do jogo e ZERADO ou JOGANDO.
 * Usada pelo service da API e pelo formulario do web, para nao duplicar a regra.
 */
export function statusAllowsRating(status: GameStatus): boolean {
  return status !== 'QUERO_JOGAR';
}
