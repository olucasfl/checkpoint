import { Injectable, Logger } from '@nestjs/common';
import {
  PSN_PAGINA_TAMANHO,
  PSN_PAGINAS_MAXIMAS,
  PSN_REQUEST_TIMEOUT_MS,
} from '../integrations.constants';
import {
  CredencialInvalidaError,
  IdExternoInvalidoError,
  PlataformaError,
  PlataformaIndisponivelError,
  PlataformaLimiteError,
  PlataformaReautenticarError,
} from '../providers/plataforma-errors';

/** O accountId da PSN: só dígitos. */
const ACCOUNT_ID_PATTERN = /^\d{1,20}$/;

export type PsnCategoria = 'ps4_game' | 'ps5_native_game' | 'pspc_game' | 'unknown';
export type PsnServico = 'trophy' | 'trophy2';

export interface PsnTokens {
  accessToken: string;
  accessExpiraEm: Date;
  refreshToken: string;
  refreshExpiraEm: Date;
}

export interface PsnContagem {
  platina: number;
  ouro: number;
  prata: number;
  bronze: number;
}

export interface PsnResumoDeTrofeus {
  accountId: string;
  nivel: number;
  progressoPercentual: number | null;
  faixa: number | null;
  trofeus: PsnContagem;
}

export interface PsnPerfil {
  onlineId: string | null;
  avatarUrl: string | null;
}

export interface PsnJogo {
  titleId: string;
  nome: string;
  categoria: PsnCategoria;
  minutosJogados: number;
  ultimaVezJogadoEm: Date | null;
  imagemUrl: string | null;
}

export interface PsnConjuntoDeTrofeus {
  npCommunicationId: string;
  servico: PsnServico;
  definidos: PsnContagem;
  ganhos: PsnContagem;
}

export type PsnTipoDeTrofeu = 'platina' | 'ouro' | 'prata' | 'bronze';

export interface PsnDefinicaoDeTrofeu {
  id: number;
  nome: string | null;
  descricao: string | null;
  iconeUrl: string | null;
  tipo: PsnTipoDeTrofeu;
  oculto: boolean;
}

export interface PsnGanhoDeTrofeu {
  id: number;
  ganho: boolean;
  ganhoEm: Date | null;
  /** 0 = ultrarraro, 1 = muito raro, 2 = raro, 3 = comum. */
  raridade: number | null;
  taxaPercentual: number | null;
}

type PsnApi = typeof import('psn-api');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numeroOuNulo(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function textoOuNulo(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function dataOuNula(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** `PT228H56M33S` (ISO 8601, 1 s) → minutos, com piso dos segundos. Valor ilegível vale 0 (o item não quebra a lista). */
export function minutosDeDuracaoIso(valor: unknown): number {
  if (typeof valor !== 'string') {
    return 0;
  }
  const partes = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    valor.trim(),
  );
  if (!partes) {
    return 0;
  }
  const [, dias, horas, minutos, segundos] = partes;
  const total =
    Number(dias ?? 0) * 86_400 +
    Number(horas ?? 0) * 3_600 +
    Number(minutos ?? 0) * 60 +
    Number(segundos ?? 0);
  return Math.floor(total / 60);
}

function contagem(value: unknown): PsnContagem {
  const c = isRecord(value) ? value : {};
  return {
    platina: numeroOuNulo(c.platinum) ?? 0,
    ouro: numeroOuNulo(c.gold) ?? 0,
    prata: numeroOuNulo(c.silver) ?? 0,
    bronze: numeroOuNulo(c.bronze) ?? 0,
  };
}

const TIPOS: Record<string, PsnTipoDeTrofeu> = {
  platinum: 'platina',
  gold: 'ouro',
  silver: 'prata',
  bronze: 'bronze',
};

/**
 * Fala com a PlayStation Network pelo pacote `psn-api` (spec integracao-playstation, D2), a ÚNICA classe do repositório
 * que o importa (`sem-import-direto.spec.ts`). A API é NÃO OFICIAL. O pacote não tem timeout, não confere o status HTTP
 * e embute a resposta da Sony nas mensagens de erro, então aqui:
 *
 * - **Timeout por `Promise.race`** (o pacote não aceita cancelamento; a `fetch` pendente termina sozinha).
 * - **Nenhuma mensagem do pacote é repassada nem logada**: o log tem só o nome da chamada e o tipo do erro. O texto
 *   do erro só é LIDO para classificar (credencial recusada, limite, indisponível).
 * - O pacote é carregado sob demanda (`import()` dinâmico): uma falha de carga vira `PlataformaIndisponivelError`
 *   na primeira chamada e não derruba o boot.
 * - Os tipos que saem daqui são neutros (nada do formato da Sony vaza para o resto do módulo).
 */
@Injectable()
export class PsnClient {
  private readonly logger = new Logger(PsnClient.name);
  private pacote: Promise<PsnApi> | null = null;

  /** Ponto de troca dos testes: o pacote real nunca é carregado por eles. */
  protected carregarPacote(): Promise<PsnApi> {
    this.pacote ??= import('psn-api');
    return this.pacote;
  }

  /** NPSSO → tokens. Recusado → `CredencialInvalidaError`. O NPSSO nunca é logado. */
  async trocarNpsso(npsso: string): Promise<PsnTokens> {
    return this.chamar('exchangeNpsso', async (psn) => {
      let codigo: string;
      try {
        codigo = await psn.exchangeNpssoForAccessCode(npsso);
      } catch (erro) {
        // O pacote lança uma mensagem própria (que cita o NPSSO) quando a Sony não devolve o código.
        if (erro instanceof Error && /npsso/i.test(erro.message)) {
          throw new CredencialInvalidaError();
        }
        throw erro;
      }
      if (typeof codigo !== 'string' || codigo === '') {
        throw new CredencialInvalidaError();
      }
      const tokens = this.lerTokens(await psn.exchangeAccessCodeForAuthTokens(codigo));
      if (!tokens) {
        throw new CredencialInvalidaError();
      }
      return tokens;
    });
  }

  /** Refresh token → tokens novos. Recusado (a Sony não devolve o access token) → `PlataformaReautenticarError`. */
  async renovar(refreshToken: string): Promise<PsnTokens> {
    return this.chamar('exchangeRefresh', async (psn) => {
      const tokens = this.lerTokens(await psn.exchangeRefreshTokenForAuthTokens(refreshToken));
      if (!tokens) {
        throw new PlataformaReautenticarError();
      }
      return tokens;
    });
  }

  async perfil(accessToken: string): Promise<PsnPerfil> {
    return this.chamar('getProfileFromAccountId', async (psn) => {
      const resposta: unknown = await psn.getProfileFromAccountId({ accessToken }, 'me');
      if (!isRecord(resposta)) {
        throw this.formatoInesperado('getProfileFromAccountId');
      }
      const avatares = Array.isArray(resposta.avatars) ? resposta.avatars : [];
      const primeiro: unknown = avatares[avatares.length > 1 ? 1 : 0];
      return {
        onlineId: textoOuNulo(resposta.onlineId),
        avatarUrl: isRecord(primeiro) ? textoOuNulo(primeiro.url) : null,
      };
    });
  }

  /** O nível e a contagem de troféus da conta (PS3 e Vita incluídos) e o `accountId` (o `idExterno` da conta). */
  async resumoDeTrofeus(accessToken: string): Promise<PsnResumoDeTrofeus> {
    return this.chamar('getUserTrophyProfileSummary', async (psn) => {
      const r: unknown = await psn.getUserTrophyProfileSummary({ accessToken }, 'me');
      if (
        !isRecord(r) ||
        typeof r.accountId !== 'string' ||
        !ACCOUNT_ID_PATTERN.test(r.accountId)
      ) {
        throw this.formatoInesperado('getUserTrophyProfileSummary');
      }
      const nivel = numeroOuNulo(r.trophyLevel);
      if (nivel === null) {
        throw this.formatoInesperado('getUserTrophyProfileSummary');
      }
      return {
        accountId: r.accountId,
        nivel,
        progressoPercentual: numeroOuNulo(r.progress),
        faixa: numeroOuNulo(r.tier),
        trofeus: contagem(r.earnedTrophies),
      };
    });
  }

  /** Os jogos já jogados (um por `titleId`), paginados com teto de páginas. */
  async jogados(accessToken: string): Promise<PsnJogo[]> {
    return this.chamar('getUserPlayedGames', async (psn) => {
      const jogos: PsnJogo[] = [];
      let offset = 0;
      for (let pagina = 0; pagina < PSN_PAGINAS_MAXIMAS; pagina += 1) {
        const r: unknown = await psn.getUserPlayedGames({ accessToken }, 'me', {
          limit: PSN_PAGINA_TAMANHO,
          offset,
        });
        if (!isRecord(r) || !Array.isArray(r.titles)) {
          throw this.formatoInesperado('getUserPlayedGames');
        }
        for (const t of r.titles as unknown[]) {
          if (!isRecord(t) || typeof t.titleId !== 'string' || typeof t.name !== 'string') {
            continue;
          }
          jogos.push({
            titleId: t.titleId,
            nome: t.name,
            categoria: this.categoria(t.category),
            minutosJogados: minutosDeDuracaoIso(t.playDuration),
            ultimaVezJogadoEm: dataOuNula(t.lastPlayedDateTime),
            imagemUrl: textoOuNulo(t.imageUrl),
          });
        }
        const total = numeroOuNulo(r.totalItemCount) ?? jogos.length;
        const proximo = numeroOuNulo(r.nextOffset);
        if (
          proximo === null ||
          proximo <= offset ||
          jogos.length >= total ||
          r.titles.length === 0
        ) {
          break;
        }
        offset = proximo;
      }
      return jogos;
    });
  }

  /** O conjunto de troféus de UM jogo e as contagens por tipo, ou `null` se a Sony não tem (nunca sincronizou). */
  async conjuntoDeTrofeus(
    accessToken: string,
    titleId: string,
  ): Promise<PsnConjuntoDeTrofeus | null> {
    return this.chamar('getUserTrophiesForSpecificTitle', async (psn) => {
      let r: unknown;
      try {
        r = await psn.getUserTrophiesForSpecificTitle({ accessToken }, 'me', {
          npTitleIds: titleId,
        });
      } catch (erro) {
        // Um jogo sem troféus na conta pode vir como "não encontrado" (não se distingue de "nunca sincronizou").
        if (erro instanceof Error && /not found|resource not found/i.test(erro.message)) {
          return null;
        }
        throw erro;
      }
      if (!isRecord(r) || !Array.isArray(r.titles)) {
        throw this.formatoInesperado('getUserTrophiesForSpecificTitle');
      }
      const primeiro: unknown = r.titles[0];
      const conjuntos =
        isRecord(primeiro) && Array.isArray(primeiro.trophyTitles) ? primeiro.trophyTitles : [];
      const conjunto: unknown = conjuntos[0];
      if (!isRecord(conjunto) || typeof conjunto.npCommunicationId !== 'string') {
        return null;
      }
      return {
        npCommunicationId: conjunto.npCommunicationId,
        servico: conjunto.npServiceName === 'trophy2' ? 'trophy2' : 'trophy',
        definidos: contagem(conjunto.definedTrophies),
        ganhos: contagem(conjunto.earnedTrophies),
      };
    });
  }

  /** Nome, descrição, ícone e tipo de cada troféu do jogo (dado do jogo, não do usuário). Em português quando existir. */
  async definicoesDeTrofeus(
    accessToken: string,
    npCommunicationId: string,
    servico: PsnServico,
  ): Promise<PsnDefinicaoDeTrofeu[]> {
    return this.chamar('getTitleTrophies', async (psn) => {
      const lista = await this.paginar('getTitleTrophies', (offset) =>
        psn.getTitleTrophies({ accessToken }, npCommunicationId, 'all', {
          npServiceName: servico,
          limit: PSN_PAGINA_TAMANHO,
          offset,
          headerOverrides: { 'Accept-Language': 'pt-BR' },
        }),
      );
      const definicoes: PsnDefinicaoDeTrofeu[] = [];
      for (const t of lista) {
        const tipo = typeof t.trophyType === 'string' ? TIPOS[t.trophyType] : undefined;
        const id = numeroOuNulo(t.trophyId);
        if (!tipo || id === null) {
          continue;
        }
        definicoes.push({
          id,
          nome: textoOuNulo(t.trophyName),
          descricao: textoOuNulo(t.trophyDetail),
          iconeUrl: textoOuNulo(t.trophyIconUrl),
          tipo,
          oculto: t.trophyHidden === true,
        });
      }
      return definicoes;
    });
  }

  /** O que o usuário ganhou de cada troféu do jogo, com a raridade. */
  async ganhosDeTrofeus(
    accessToken: string,
    npCommunicationId: string,
    servico: PsnServico,
  ): Promise<PsnGanhoDeTrofeu[]> {
    return this.chamar('getUserTrophiesEarnedForTitle', async (psn) => {
      const lista = await this.paginar('getUserTrophiesEarnedForTitle', (offset) =>
        psn.getUserTrophiesEarnedForTitle({ accessToken }, 'me', npCommunicationId, 'all', {
          npServiceName: servico,
          limit: PSN_PAGINA_TAMANHO,
          offset,
        }),
      );
      const ganhos: PsnGanhoDeTrofeu[] = [];
      for (const t of lista) {
        const id = numeroOuNulo(t.trophyId);
        if (id === null) {
          continue;
        }
        ganhos.push({
          id,
          ganho: t.earned === true,
          ganhoEm: dataOuNula(t.earnedDateTime),
          raridade: numeroOuNulo(t.trophyRare),
          taxaPercentual: numeroOuNulo(t.trophyEarnedRate),
        });
      }
      return ganhos;
    });
  }

  validarAccountId(accountId: string): void {
    if (typeof accountId !== 'string' || !ACCOUNT_ID_PATTERN.test(accountId)) {
      throw new IdExternoInvalidoError('idConta', 'O accountId da PlayStation deve ter só dígitos');
    }
  }

  private async paginar(
    nome: string,
    pagina: (offset: number) => Promise<unknown>,
  ): Promise<Record<string, unknown>[]> {
    const itens: Record<string, unknown>[] = [];
    let offset = 0;
    for (let n = 0; n < PSN_PAGINAS_MAXIMAS; n += 1) {
      const r = await pagina(offset);
      if (!isRecord(r) || !Array.isArray(r.trophies)) {
        throw this.formatoInesperado(nome);
      }
      for (const t of r.trophies as unknown[]) {
        if (isRecord(t)) {
          itens.push(t);
        }
      }
      const total = numeroOuNulo(r.totalItemCount) ?? itens.length;
      const proximo = numeroOuNulo(r.nextOffset);
      if (
        proximo === null ||
        proximo <= offset ||
        itens.length >= total ||
        r.trophies.length === 0
      ) {
        break;
      }
      offset = proximo;
    }
    return itens;
  }

  private lerTokens(r: unknown): PsnTokens | null {
    if (!isRecord(r) || typeof r.accessToken !== 'string' || r.accessToken === '') {
      return null;
    }
    if (typeof r.refreshToken !== 'string' || r.refreshToken === '') {
      return null;
    }
    const agora = Date.now();
    return {
      accessToken: r.accessToken,
      accessExpiraEm: new Date(agora + (numeroOuNulo(r.expiresIn) ?? 3_600) * 1000),
      refreshToken: r.refreshToken,
      refreshExpiraEm: new Date(
        agora + (numeroOuNulo(r.refreshTokenExpiresIn) ?? 5_184_000) * 1000,
      ),
    };
  }

  private categoria(valor: unknown): PsnCategoria {
    return valor === 'ps4_game' || valor === 'ps5_native_game' || valor === 'pspc_game'
      ? valor
      : 'unknown';
  }

  private formatoInesperado(chamada: string): PlataformaIndisponivelError {
    this.logger.warn(`PSN ${chamada}: resposta em formato inesperado`);
    return new PlataformaIndisponivelError('resposta da PlayStation em formato inesperado');
  }

  /**
   * Executa uma chamada com timeout e traduz a falha em erro de domínio. NUNCA repassa nem loga a mensagem do
   * pacote (ela pode conter a resposta da Sony): só o nome da chamada e o tipo do erro.
   */
  private async chamar<T>(nome: string, corpo: (psn: PsnApi) => Promise<T>): Promise<T> {
    let temporizador: NodeJS.Timeout | undefined;
    try {
      const psn = await this.carregarPacote();
      return await Promise.race([
        corpo(psn),
        new Promise<never>((_, rejeitar) => {
          temporizador = setTimeout(() => rejeitar(new TempoEsgotado()), PSN_REQUEST_TIMEOUT_MS);
        }),
      ]);
    } catch (erro) {
      throw this.traduzir(nome, erro);
    } finally {
      clearTimeout(temporizador);
    }
  }

  private traduzir(nome: string, erro: unknown): PlataformaError | IdExternoInvalidoError {
    if (erro instanceof IdExternoInvalidoError) {
      return erro;
    }
    if (erro instanceof PlataformaError) {
      this.logger.warn(`PSN ${nome}: ${erro.code}`);
      return erro;
    }
    if (erro instanceof TempoEsgotado) {
      this.logger.warn(`PSN ${nome}: tempo esgotado`);
      return new PlataformaIndisponivelError('a PlayStation não respondeu a tempo');
    }
    // O texto é só LIDO para classificar; nunca sai daqui.
    const texto = erro instanceof Error ? erro.message.toLowerCase() : '';
    if (/\b429\b|rate limit|too many requests/.test(texto)) {
      this.logger.warn(`PSN ${nome}: limite`);
      return new PlataformaLimiteError();
    }
    if (/\b401\b|unauthori[sz]ed|expired|invalid[_ ]?(access[_ ])?token|access token/.test(texto)) {
      this.logger.warn(`PSN ${nome}: credencial recusada`);
      return new PlataformaReautenticarError();
    }
    this.logger.warn(`PSN ${nome}: falhou`);
    return new PlataformaIndisponivelError();
  }
}

class TempoEsgotado extends Error {}
