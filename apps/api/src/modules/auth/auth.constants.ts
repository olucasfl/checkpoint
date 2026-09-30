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
export const PASSWORD_CHANGE_LIMIT = { limit: 5, ttl: 15 * 60_000 } as const;

/** Verificação de e-mail e recuperação de senha (spec verificacao-de-email-e-recuperacao-de-senha). */
export const VERIFICACAO_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_SENHA_TTL_MS = 30 * 60 * 1000;
export const VERIFICAR_EMAIL_LIMIT = { limit: 20, ttl: 60_000 } as const;
export const REENVIAR_VERIFICACAO_LIMIT = { limit: 5, ttl: 60_000 } as const;
export const ESQUECI_SENHA_LIMIT = { limit: 5, ttl: 60_000 } as const;
export const REDEFINIR_SENHA_LIMIT = { limit: 10, ttl: 60_000 } as const;

/** Corpo fixo do `esqueci-senha`: igual exista a conta ou não, tenha o envio dado certo ou não. */
export const ESQUECI_SENHA_MENSAGEM = 'Se esse e-mail existir, você vai receber um link.';
