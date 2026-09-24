/** Valores da spec autenticacao. São detalhe da API: não vão para o `packages/shared`. */

export const TOKEN_ISSUER = 'checkpoint-api';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Janela em que o refresh token ANTERIOR ainda é tratado como corrida de abas, não como reuso. */
export const REFRESH_GRACE_WINDOW_MS = 30_000;

/** A 11ª sessão apaga a de `ultimoUsoEm` mais antigo. */
export const MAX_SESSIONS_PER_USER = 10;

export const REFRESH_COOKIE_NAME = 'checkpoint_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

/** Limites por IP (janelas em ms, como o `@nestjs/throttler` v6 espera). */
export const LOGIN_LIMIT = { limit: 5, ttl: 60_000 } as const;
export const REFRESH_LIMIT = { limit: 30, ttl: 60_000 } as const;
export const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
