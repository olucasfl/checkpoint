/**
 * Contrato do catalogo de jogos, consumido pela API e pelo web.
 * Codigo puro: sem `window`, sem Node, sem `@prisma/client` (ARCHITECTURE.md §6).
 */

import { type ApiErrorCode } from './auth';

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
/** Passo das notas por criterio (uma casa decimal). */
export const GAME_RATING_STEP = 0.1;
export const GAME_DESCRIPTION_MAX_LENGTH = 1000;

/**
 * Os criterios da avaliacao (spec avaliacao-de-jogos): chave, rotulo e a descricao curta que a tela mostra
 * ao lado. Fonte unica de API e web; a ordem daqui e a ordem de tela.
 */
export const GAME_RATING_CRITERIA = [
  {
    chave: 'gameplay',
    rotulo: 'Gameplay',
    descricao: 'Jogabilidade, controles, mecânicas e o quanto é divertido jogar.',
  },
  {
    chave: 'historia',
    rotulo: 'História',
    descricao: 'Enredo, roteiro, personagens e ritmo da narrativa.',
  },
  {
    chave: 'graficos',
    rotulo: 'Gráficos',
    descricao: 'Direção de arte, visual, animações e identidade estética.',
  },
  {
    chave: 'trilhaSonora',
    rotulo: 'Trilha sonora',
    descricao: 'Música, efeitos sonoros e dublagem.',
  },
  {
    chave: 'performance',
    rotulo: 'Performance técnica',
    descricao: 'Estabilidade, desempenho, bugs e tempo de carregamento.',
  },
] as const;

export type GameRatingKey = (typeof GAME_RATING_CRITERIA)[number]['chave'];
export const GAME_RATING_KEYS: readonly GameRatingKey[] = GAME_RATING_CRITERIA.map((c) => c.chave);

/** Uma nota por criterio, de 0 a 10; `null` = sem nota (diferente de 0, que e uma nota). */
export type GameRatings = Record<GameRatingKey, number | null>;

/** Capa: limite de tamanho (a API e o web usam a mesma fonte) e tipos aceitos. */
export const GAME_COVER_MAX_BYTES = 2 * 1024 * 1024;
export const GAME_COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type GameCoverMimeType = (typeof GAME_COVER_MIME_TYPES)[number];

/** Nome do campo do formulario multipart de `PUT /api/games/:id/capa`. */
export const GAME_COVER_FIELD = 'arquivo';

/**
 * Jogo como a API o devolve. `plataforma`, `descricao`, cada nota e `notaMedia` sao `null` quando
 * ausentes. `notaMedia` nunca e gravada: e `notaMedia(notas)`, calculada na resposta.
 */
export interface Game {
  id: string;
  titulo: string;
  plataforma: string | null;
  status: GameStatus;
  notas: GameRatings;
  notaMedia: number | null;
  descricao: string | null;
  /** URL publica da capa, ou `null` sem capa. O caminho cru do bucket nunca e exposto. */
  capaUrl: string | null;
  /** ISO 8601. */
  criadoEm: string;
  /** ISO 8601. */
  atualizadoEm: string;
}

/**
 * Notas no corpo de escrita: um campo por criterio, no topo do corpo (o erro sai em
 * `fields.<criterio>`); na resposta elas vem agrupadas em `notas`.
 */
export type GameRatingsRequest = { [K in GameRatingKey]?: number | null };

/** Corpo de `POST /api/games`. */
export interface CreateGameRequest extends GameRatingsRequest {
  titulo: string;
  status: GameStatus;
  plataforma?: string | null;
  descricao?: string | null;
}

/**
 * Corpo de `PATCH /api/games/:id`: ao menos um campo. So `plataforma`, os criterios e `descricao`
 * aceitam `null` (removem o valor); `titulo` e `status` nao.
 */
export interface UpdateGameRequest extends GameRatingsRequest {
  titulo?: string;
  status?: GameStatus;
  plataforma?: string | null;
  descricao?: string | null;
}

/** Query de `GET /api/games`. */
export interface ListGamesQuery {
  status?: GameStatus;
}

/**
 * Campos de formulario que um erro pode apontar (`arquivo` = a capa; `notas` = a secao Avaliacao
 * inteira, para "Zerado sem nenhum criterio"). Os cinco ultimos sao os dos formularios de autenticacao
 * (spec autenticacao): um tipo so para `fields`, no web inteiro.
 */
export type ApiErrorField =
  | 'titulo'
  | 'plataforma'
  | 'status'
  | GameRatingKey
  | 'notas'
  | 'descricao'
  | 'arquivo'
  | 'nome'
  | 'email'
  | 'senha'
  | 'senhaAtual'
  | 'novaSenha';

/**
 * Formato dos erros 400, 409, 413 e 502 (o 404 traz so `statusCode` e `message`).
 * `fields` diz em qual campo do formulario mostrar a mensagem.
 */
export interface ApiErrorResponse {
  statusCode: number;
  /** Codigo estavel (rotas de auth): o web mostra o texto pelo `code`, nunca pela `message`. */
  code?: ApiErrorCode;
  message: string;
  fields?: Partial<Record<ApiErrorField, string>>;
}

/**
 * Regra das notas: so existem quando o status FINAL do jogo e ZERADO ou JOGANDO.
 * Usada pelo service da API e pelo formulario do web, para nao duplicar a regra.
 */
export function statusAllowsRating(status: GameStatus): boolean {
  return status !== 'QUERO_JOGAR';
}

/** Uma nota valida: numero finito de 0 a 10 com no maximo 1 casa decimal (7,3 sim; 7,55 nao). */
export function isValidRating(valor: unknown): valor is number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return false;
  }
  if (valor < GAME_RATING_MIN || valor > GAME_RATING_MAX) {
    return false;
  }
  // Checagem EXATA, sem tolerancia: `toFixed(1)` arredonda para a casa decimal mais proxima e `Number()` devolve
  // o double que o literal escrito com 1 casa produz (o mesmo que o JSON.parse de "7.3"), entao 7,3 e 0,1 passam
  // e 7,55 nao. Uma tolerancia (ex.: 1e-9) deixaria 9.99999999999 passar e ser arredondado em silencio para 10,0.
  return Number(valor.toFixed(1)) === valor;
}

/**
 * A nota geral: media dos criterios preenchidos (`null` e ausente nao entram; 0 entra), com 1 casa
 * decimal, arredondada para cima na metade (8,75 -> 8,8). Sem nenhum criterio, `null`. Calcula em
 * decimos inteiros, entao 7,3 + 8,5 nunca vira 7,8000000000000001. Usada pela API e pelo web.
 */
export function notaMedia(
  notas: Partial<Record<GameRatingKey, number | null | undefined>>,
): number | null {
  const decimos = GAME_RATING_KEYS.flatMap((chave) => {
    const valor = notas[chave];
    return typeof valor === 'number' ? [Math.round(valor * 10)] : [];
  });
  if (decimos.length === 0) {
    return null;
  }
  const soma = decimos.reduce((total, valor) => total + valor, 0);
  return Math.floor(soma / decimos.length + 0.5) / 10;
}
