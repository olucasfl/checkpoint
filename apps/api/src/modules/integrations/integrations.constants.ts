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

// Vínculo da conta (OpenID): o `state` amarra o retorno da Steam ao usuário, e o cookie, ao navegador.
/** Vida do `state` e do cookie do vínculo: o tempo de ir à Steam, entrar e voltar. */
export const VINCULO_STATE_TTL_SECONDS = 10 * 60;

/**
 * Emissor PRÓPRIO do `state`, diferente do dos tokens de acesso (`checkpoint-api`). O `state` reaproveita o
 * segredo do access token, então o emissor e o `typ` são o que impede um valer no lugar do outro: um `state`
 * apresentado como access token falha na verificação do emissor (e, se passasse, no `typ`).
 */
export const VINCULO_STATE_ISSUER = 'checkpoint-api:vinculo';

export const VINCULO_COOKIE_NAME = 'checkpoint_vinculo';

/** O cookie só viaja para as rotas de integração (o `retorno` e o `vinculo` estão sob este caminho). */
export const VINCULO_COOKIE_PATH = '/api/integracoes';

// Limites das rotas de integração: POR USUÁRIO (não por IP), para não dependerem do `trust proxy`.
/** Leitura e atualização: 30 por minuto, com contador próprio por rota. */
export const INTEGRACOES_LIMIT = { limit: 30, ttl: 60_000 } as const;

/** Iniciar o vínculo manda o usuário para fora do app: 5 por minuto. */
export const INTEGRACOES_VINCULO_LIMIT = { limit: 5, ttl: 60_000 } as const;

/** Quantos jogos "mais jogados" o cartão do perfil mostra. */
export const MAIS_JOGADOS_NO_CARTAO = 3;

// A biblioteca do diálogo "Buscar na Steam": sem paginação, a busca e o limite mantêm a resposta pequena.
export const BIBLIOTECA_LIMITE_PADRAO = 30;
export const BIBLIOTECA_LIMITE_MAXIMO = 50;
export const BIBLIOTECA_BUSCA_MAX = 100;

/** Quantos jogos do catálogo com o mesmo título um item da biblioteca sugere ("já no seu catálogo"). */
export const MAX_JOGOS_PARECIDOS = 3;
