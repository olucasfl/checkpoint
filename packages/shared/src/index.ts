/**
 * Ponto de entrada do pacote compartilhado entre o frontend (@checkpoint/web)
 * e o backend (@checkpoint/api).
 *
 * Coloque aqui (ou em arquivos reexportados por este index) apenas codigo
 * agnostico de plataforma: tipos, contratos de API, enums e utilitarios puros.
 * Nada que dependa de `window`, do Node ou do Prisma.
 */

export * from './auth';
export * from './games';
export * from './integracoes';

/** Exemplo de contrato compartilhado — substitua quando as entidades existirem. */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'up' | 'down';
}

/** Exemplo de utilitario compartilhado — remova quando nao for mais necessario. */
export const APP_NAME = 'Checkpoint' as const;
