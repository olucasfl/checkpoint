import { type ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from './env.validation';

/** ConfigService tipado com as variaveis validadas em env.validation.ts. */
export type AppConfigService = ConfigService<EnvironmentVariables, true>;

/** Prefixo aplicado a todas as rotas HTTP. */
export const API_GLOBAL_PREFIX = 'api';

/** Caminho (ja incluindo o prefixo global) em que o Swagger UI e servido. */
export const SWAGGER_PATH = 'docs';

/**
 * Converte a env CORS_ORIGIN em um valor aceito pelo CORS do Nest.
 * `*` libera todas as origens; caso contrario, aceita uma lista separada por virgula.
 */
export function parseCorsOrigin(rawOrigin: string): string | string[] | boolean {
  const value = rawOrigin.trim();

  if (value === '*') {
    return true;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 1 ? origins : (origins[0] ?? false);
}
