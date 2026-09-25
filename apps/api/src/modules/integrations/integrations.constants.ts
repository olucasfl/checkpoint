/**
 * Números do módulo de integrações (spec `integracao-plataformas`), num lugar só e com nome, como o
 * `auth.constants.ts`: mudar um valor é mudar uma linha. Os dois intervalos de atualização (1 h e 30 s)
 * ficam no `shared`, porque o web também os lê.
 */

/** Cada chamada à Steam desiste depois disso. Sem tentar de novo: a cota é da chave, não do usuário. */
export const STEAM_REQUEST_TIMEOUT_MS = 8_000;

/** Host público da Steam Web API (chaves comuns; `partner.steam-api.com` é só para publishers). */
export const STEAM_API_BASE_URL = 'https://api.steampowered.com';

/** Idioma dos textos das conquistas (nome e descrição). */
export const STEAM_LANGUAGE = 'brazilian';

// Cache em memória dos dados da Steam (uma instância; perdido quando o Render dorme). Ainda sem uso na
// etapa 1: quem consome (o provider da Steam) chega nas etapas seguintes, mas os valores são decisão
// da spec ("Custo e cache") e ficam aqui, num lugar só.
export const LIBRARY_CACHE_TTL_MS = 10 * 60 * 1000;
export const ACHIEVEMENT_SCHEMA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const GLOBAL_PERCENTAGES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PLAYER_ACHIEVEMENTS_CACHE_TTL_MS = 5 * 60 * 1000;

/** Teto de entradas de cada cache: passou disso, descarta a mais antiga. */
export const CACHE_MAX_ENTRIES = 500;
