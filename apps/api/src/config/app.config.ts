import { type ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from './env.validation';

/** ConfigService tipado com as variaveis validadas em env.validation.ts. */
export type AppConfigService = ConfigService<EnvironmentVariables, true>;

/** Prefixo aplicado a todas as rotas HTTP. */
export const API_GLOBAL_PREFIX = 'api';

/** Caminho (ja incluindo o prefixo global) em que o Swagger UI e servido. */
export const SWAGGER_PATH = 'docs';

/**
 * Converte a env CORS_ORIGIN na lista de origens do CORS. Sempre uma LISTA, nunca uma string: com uma
 * string o `cors` devolve `Access-Control-Allow-Origin` para qualquer origem que perguntar. `*` é
 * recusado no boot (`env.validation.ts`): com cookie de sessão e `credentials: true`, refletir
 * qualquer origem deixaria qualquer site renovar a sessão.
 */
export function parseCorsOrigin(rawOrigin: string): string[] {
  return rawOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
