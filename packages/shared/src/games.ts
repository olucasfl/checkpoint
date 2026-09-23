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

/** Capa: limite de tamanho (a API e o web usam a mesma fonte) e tipos aceitos. */
export const GAME_COVER_MAX_BYTES = 2 * 1024 * 1024;
export const GAME_COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type GameCoverMimeType = (typeof GAME_COVER_MIME_TYPES)[number];

/** Nome do campo do formulario multipart de `PUT /api/games/:id/capa`. */
export const GAME_COVER_FIELD = 'arquivo';

/** Jogo como a API o devolve. `plataforma` e `nota` sao `null` quando ausentes. */
export interface Game {
  id: string;
  titulo: string;
  plataforma: string | null;
  status: GameStatus;
  nota: number | null;
  /** URL publica da capa, ou `null` sem capa. O caminho cru do bucket nunca e exposto. */
  capaUrl: string | null;
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

/** Campos de formulario que um erro pode apontar (`arquivo` = a capa). */
export type ApiErrorField = 'titulo' | 'plataforma' | 'status' | 'nota' | 'arquivo';

/**
 * Formato dos erros 400, 409, 413 e 502 (o 404 traz so `statusCode` e `message`).
 * `fields` diz em qual campo do formulario mostrar a mensagem.
 */
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
