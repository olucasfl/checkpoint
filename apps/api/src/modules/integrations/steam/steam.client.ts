import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../../../config/env.validation';
import {
  STEAM_API_BASE_URL,
  STEAM_LANGUAGE,
  STEAM_REQUEST_TIMEOUT_MS,
} from '../integrations.constants';
import {
  IdExternoInvalidoError,
  PlataformaIndisponivelError,
  PlataformaLimiteError,
} from '../providers/plataforma-errors';

/** SteamID64: 17 dígitos, sempre com o prefixo 7656 (contas individuais). */
const STEAM_ID_PATTERN = /^7656\d{13}$/;
const APP_ID_PATTERN = /^\d{1,10}$/;

/** Visibilidade de um perfil público em `communityvisibilitystate` (1 = privado). */
export const STEAM_VISIBILIDADE_PUBLICA = 3;

export interface SteamPerfil {
  visibilidade: number | null;
  nome: string;
  avatarUrl: string | null;
  perfilUrl: string | null;
  /** `timecreated` (segundos desde 1970). Só vem com o perfil público; SEM fixture real (CA-63). */
  criadoEmUnix?: number | null;
  /** `personastate`: 0 offline, 1 online, 2 a 6 (ocupado, ausente, soneca, quer trocar, quer jogar). */
  estado?: number | null;
  /** `gameextrainfo`: o jogo em andamento (só aparece quando a pessoa está jogando). */
  jogandoAgora?: string | null;
}

export interface SteamJogoDaBiblioteca {
  appid: string;
  nome: string;
  minutosJogados: number;
  /** A Steam manda `rtime_last_played: 0` para "nunca jogado": aqui vira `null`. */
  ultimaVezJogadoEm: Date | null;
}

export interface SteamBiblioteca {
  /** Sem `game_count` na resposta: perfil (ou "detalhes do jogo") privado. Biblioteca vazia é `game_count: 0`. */
  privada: boolean;
  total: number;
  jogos: SteamJogoDaBiblioteca[];
}

export interface SteamConquistaDoJogador {
  id: string;
  desbloqueada: boolean;
  desbloqueadaEm: Date | null;
  nome: string | null;
  descricao: string | null;
}

export type SteamConquistasDoJogador =
  | { tipo: 'ok'; nomeDoJogo: string | null; conquistas: SteamConquistaDoJogador[] }
  | { tipo: 'sem-conquistas' }
  | { tipo: 'negado' };

export interface SteamConquistaDoSchema {
  id: string;
  nome: string;
  /** Conquista oculta vem sem descrição até ser desbloqueada. */
  descricao: string | null;
  oculta: boolean;
  iconeUrl: string | null;
  iconeCinzaUrl: string | null;
}

interface RequestOptions {
  /** Status não-2xx que o chamador trata (o corpo é lido se for JSON). Os outros viram erro. */
  aceitar?: number[];
  /** `false` nas chamadas que a Steam não exige chave (não a manda). */
  comChave?: boolean;
}

interface SteamResponse {
  status: number;
  /** `null` quando o corpo não é JSON (a Steam responde erros em HTML). */
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function dateFromUnixSeconds(value: unknown): Date | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value * 1000)
    : null;
}

/**
 * Fala com a Steam Web API pelo `fetch` nativo (sem SDK), no padrão do `StorageService`: isolado atrás de
 * métodos simples, com timeout, e mockado nos testes. Regras (spec `integracao-plataformas`):
 *
 * - **A chave viaja na query string**, então NADA aqui loga a URL, a chave, cabeçalhos nem o corpo: o log
 *   tem só o nome da chamada e o status HTTP (ou o tipo do erro de rede).
 * - **Sem `JSON.parse` cego:** a Steam responde erros em HTML (o 401 da chave inválida e o 400 de ID
 *   malformado), então o corpo só é lido como JSON quando o `content-type` é JSON.
 * - **SteamID e appid são validados antes de chamar:** ID malformado é erro de validação, nunca "privado".
 * - Falha vira `PlataformaIndisponivelError` (timeout, 5xx, 401, 403, resposta ilegível) ou
 *   `PlataformaLimiteError` (429). Quem chama decide o que fazer com o erro.
 */
@Injectable()
export class SteamClient {
  private readonly logger = new Logger(SteamClient.name);
  private readonly apiKey: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.apiKey = config.get('STEAM_API_KEY', { infer: true });
  }

  /** `null` quando a Steam não conhece o ID. */
  async obterPerfil(steamId: string): Promise<SteamPerfil | null> {
    this.validarSteamId(steamId);
    const { body } = await this.request('GetPlayerSummaries', 'ISteamUser/GetPlayerSummaries/v2/', {
      steamids: steamId,
    });
    const players = this.pick(body, ['response', 'players']);
    if (!Array.isArray(players)) {
      throw this.formatoInesperado('GetPlayerSummaries');
    }
    const player: unknown = players[0];
    if (!isRecord(player)) {
      return null;
    }
    return {
      visibilidade:
        typeof player.communityvisibilitystate === 'number'
          ? player.communityvisibilitystate
          : null,
      nome: textOrNull(player.personaname) ?? '',
      avatarUrl: textOrNull(player.avatarfull),
      perfilUrl: textOrNull(player.profileurl),
      criadoEmUnix:
        typeof player.timecreated === 'number' && player.timecreated > 0
          ? player.timecreated
          : null,
      estado: typeof player.personastate === 'number' ? player.personastate : null,
      jogandoAgora: textOrNull(player.gameextrainfo),
    };
  }

  /** Com `appId`, só aquele jogo (`appids_filter`): fora da biblioteca volta `jogos: []`. */
  async listarJogos(steamId: string, opcoes: { appId?: string } = {}): Promise<SteamBiblioteca> {
    this.validarSteamId(steamId);
    if (opcoes.appId !== undefined) {
      this.validarAppId(opcoes.appId);
    }
    const params: Record<string, string> =
      opcoes.appId === undefined
        ? { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' }
        : {
            input_json: JSON.stringify({
              steamid: steamId,
              appids_filter: [Number(opcoes.appId)],
              include_appinfo: true,
              include_played_free_games: true,
            }),
          };
    const { body } = await this.request(
      'GetOwnedGames',
      'IPlayerService/GetOwnedGames/v1/',
      params,
    );
    const response = isRecord(body) ? body.response : undefined;
    if (!isRecord(response)) {
      throw this.formatoInesperado('GetOwnedGames');
    }
    if (!('game_count' in response)) {
      return { privada: true, total: 0, jogos: [] };
    }
    const games: unknown[] = Array.isArray(response.games) ? response.games : [];
    const jogos = games.filter(isRecord).map((game) => ({
      appid: String(game.appid),
      nome: typeof game.name === 'string' ? game.name : '',
      minutosJogados:
        typeof game.playtime_forever === 'number' && game.playtime_forever > 0
          ? game.playtime_forever
          : 0,
      ultimaVezJogadoEm: dateFromUnixSeconds(game.rtime_last_played),
    }));
    return {
      privada: false,
      total: typeof response.game_count === 'number' ? response.game_count : jogos.length,
      jogos,
    };
  }

  async obterConquistasDoJogador(
    steamId: string,
    appId: string,
  ): Promise<SteamConquistasDoJogador> {
    this.validarSteamId(steamId);
    this.validarAppId(appId);
    // 400 = jogo sem estatísticas ("Requested app has no stats", fixture REAL). "Negado" (detalhes do jogo
    // privados) = 403 ou 200 com success:false: SIMULADO, sem fixture real (CA-63). Rode
    // `node apps/api/scripts/capturar-fixtures-steam.cjs detalhes-privados` para confirmar.
    const { status, body } = await this.request(
      'GetPlayerAchievements',
      'ISteamUserStats/GetPlayerAchievements/v1/',
      { steamid: steamId, appid: appId, l: STEAM_LANGUAGE },
      { aceitar: [400, 403] },
    );
    if (status === 403) {
      return { tipo: 'negado' };
    }
    const stats = isRecord(body) ? body.playerstats : undefined;
    if (!isRecord(stats)) {
      // 400 em HTML (pedido malformado) ou corpo que não é o esperado: problema nosso ou da Steam.
      throw this.formatoInesperado('GetPlayerAchievements');
    }
    if (status === 400) {
      if (typeof stats.error === 'string' && stats.error.toLowerCase().includes('no stats')) {
        return { tipo: 'sem-conquistas' };
      }
      throw this.formatoInesperado('GetPlayerAchievements');
    }
    if (stats.success !== true) {
      return { tipo: 'negado' };
    }
    if (!Array.isArray(stats.achievements)) {
      return { tipo: 'sem-conquistas' };
    }
    const conquistas = (stats.achievements as unknown[]).filter(isRecord).map((item) => ({
      id: String(item.apiname),
      desbloqueada: item.achieved === 1,
      desbloqueadaEm: item.achieved === 1 ? dateFromUnixSeconds(item.unlocktime) : null,
      nome: textOrNull(item.name),
      descricao: textOrNull(item.description),
    }));
    return { tipo: 'ok', nomeDoJogo: textOrNull(stats.gameName), conquistas };
  }

  /** Vazio quando o jogo não tem conquistas (o schema vem sem `achievements`). */
  async obterSchema(appId: string): Promise<SteamConquistaDoSchema[]> {
    this.validarAppId(appId);
    const { body } = await this.request(
      'GetSchemaForGame',
      'ISteamUserStats/GetSchemaForGame/v2/',
      { appid: appId, l: STEAM_LANGUAGE },
    );
    const game = isRecord(body) ? body.game : undefined;
    if (!isRecord(game)) {
      throw this.formatoInesperado('GetSchemaForGame');
    }
    const stats = game.availableGameStats;
    const achievements = isRecord(stats) ? stats.achievements : undefined;
    if (!Array.isArray(achievements)) {
      return [];
    }
    return (achievements as unknown[]).filter(isRecord).map((item) => ({
      id: String(item.name),
      nome: textOrNull(item.displayName) ?? String(item.name),
      descricao: textOrNull(item.description),
      oculta: item.hidden === 1,
      iconeUrl: textOrNull(item.icon),
      iconeCinzaUrl: textOrNull(item.icongray),
    }));
  }

  /** `apiname` → % dos jogadores, com 1 casa. A Steam manda o `percent` como texto ("40.7"). */
  async obterPercentuaisGlobais(appId: string): Promise<Map<string, number>> {
    this.validarAppId(appId);
    const { body } = await this.request(
      'GetGlobalAchievementPercentagesForApp',
      'ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
      { gameid: appId },
      { comChave: false },
    );
    const achievements = this.pick(body, ['achievementpercentages', 'achievements']);
    if (!Array.isArray(achievements)) {
      throw this.formatoInesperado('GetGlobalAchievementPercentagesForApp');
    }
    const result = new Map<string, number>();
    for (const item of (achievements as unknown[]).filter(isRecord)) {
      const percent = typeof item.percent === 'string' ? Number(item.percent) : item.percent;
      if (
        typeof item.name === 'string' &&
        typeof percent === 'number' &&
        Number.isFinite(percent)
      ) {
        result.set(item.name, Math.round(percent * 10) / 10);
      }
    }
    return result;
  }

  private validarSteamId(steamId: string): void {
    if (typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
      throw new IdExternoInvalidoError(
        'steamId',
        'O SteamID deve ter 17 dígitos e começar com 7656',
      );
    }
  }

  private validarAppId(appId: string): void {
    if (typeof appId !== 'string' || !APP_ID_PATTERN.test(appId)) {
      throw new IdExternoInvalidoError('appId', 'O appid deve ser um número de até 10 dígitos');
    }
  }

  private pick(body: unknown, path: string[]): unknown {
    let current: unknown = body;
    for (const key of path) {
      current = isRecord(current) ? current[key] : undefined;
    }
    return current;
  }

  private formatoInesperado(operation: string): PlataformaIndisponivelError {
    // Só o nome da chamada: o corpo pode ter dado do usuário e nunca vai para o log.
    this.logger.error(`Steam (${operation}) respondeu em formato inesperado`);
    return new PlataformaIndisponivelError();
  }

  private async request(
    operation: string,
    path: string,
    params: Record<string, string>,
    options: RequestOptions = {},
  ): Promise<SteamResponse> {
    const query = new URLSearchParams({
      ...(options.comChave === false ? {} : { key: this.apiKey }),
      format: 'json',
      ...params,
    });

    let response: Response;
    try {
      response = await fetch(`${STEAM_API_BASE_URL}/${path}?${query.toString()}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(STEAM_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Só o tipo do erro (TimeoutError, TypeError…): o objeto pode carregar a requisição, e com ela a chave.
      const kind = error instanceof Error ? error.name : 'erro desconhecido';
      this.logger.error(`Steam (${operation}) sem resposta: ${kind}`);
      throw new PlataformaIndisponivelError();
    }

    const status = response.status;
    const aceito = response.ok || (options.aceitar ?? []).includes(status);

    if (!aceito) {
      if (status === 429) {
        this.logger.warn(`Steam (${operation}) respondeu 429`);
        throw new PlataformaLimiteError();
      }
      if (status === 401 || status === 403) {
        // Chave recusada: é configuração, não falha passageira. Vale um `error` para alguém ver.
        this.logger.error(`Steam (${operation}) recusou a chave: HTTP ${status}`);
      } else {
        this.logger.error(`Steam (${operation}) respondeu HTTP ${status}`);
      }
      throw new PlataformaIndisponivelError();
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) {
      // A Steam responde erros em HTML: ler isso como JSON só produziria uma exceção sem sentido.
      if (response.ok) {
        this.logger.error(`Steam (${operation}) respondeu HTTP ${status} sem JSON`);
        throw new PlataformaIndisponivelError();
      }
      return { status, body: null };
    }

    try {
      return { status, body: (await response.json()) as unknown };
    } catch {
      this.logger.error(`Steam (${operation}) respondeu HTTP ${status} com JSON inválido`);
      throw new PlataformaIndisponivelError();
    }
  }
}
