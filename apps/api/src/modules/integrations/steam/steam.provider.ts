import { Injectable } from '@nestjs/common';
import { type AvisoPlataforma, type Conquista, type StatusNaPlataforma } from '@checkpoint/shared';
import { CarregadorEmCache } from '../cache/carregador-em-cache';
import {
  ACHIEVEMENT_SCHEMA_CACHE_TTL_MS,
  CACHE_MAX_ENTRIES,
  GLOBAL_PERCENTAGES_CACHE_TTL_MS,
  PLAYER_ACHIEVEMENTS_CACHE_TTL_MS,
} from '../integrations.constants';
import {
  type DadosDoJogo,
  type DetalheDoJogo,
  type GameProvider,
  type ItemDaBiblioteca,
  type OpcoesDoDetalhe,
  type PerfilBasico,
} from '../providers/game-provider';
import {
  PerfilPrivadoError,
  PlataformaError,
  PlataformaIndisponivelError,
  PlataformaItemNaoEncontradoError,
} from '../providers/plataforma-errors';
import { OpenIdInvalidoError, SteamOpenId } from './steam-open-id';
import {
  STEAM_VISIBILIDADE_PUBLICA,
  SteamClient,
  type SteamConquistaDoSchema,
  type SteamConquistasDoJogador,
} from './steam.client';
import { avatarUrlSeguro, capaOficialUrl, iconeUrlSeguro, perfilUrlSeguro } from './steam-urls';

/** O nome guardado no vínculo quando a Steam não devolve um (a coluna cabe 80 caracteres). */
export const NOME_PADRAO_DA_CONTA = 'Conta Steam';
const NOME_MAX = 80;

/**
 * A Steam como `GameProvider` (spec `integracao-plataformas`). Junta o `SteamOpenId` (provar quem é o
 * usuário) e o `SteamClient` (ler a biblioteca), e traduz o que a Steam devolve para o vocabulário neutro
 * da interface. Não guarda nada e não conhece HTTP nem Prisma: quem persiste e responde é o service.
 */
@Injectable()
export class SteamProvider implements GameProvider {
  readonly id = 'STEAM' as const;

  // Caches em memória (spec, "Custo e cache"): as conquistas do jogador por SteamID e appid (5 min) e o schema e os
  // percentuais por appid (24 h; dado público, dividido entre usuários). Chamadas simultâneas iguais viram uma só.
  private readonly conquistasDoJogador = new CarregadorEmCache<SteamConquistasDoJogador>(
    PLAYER_ACHIEVEMENTS_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );
  private readonly schemas = new CarregadorEmCache<SteamConquistaDoSchema[]>(
    ACHIEVEMENT_SCHEMA_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );
  private readonly percentuais = new CarregadorEmCache<Map<string, number>>(
    GLOBAL_PERCENTAGES_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );

  constructor(
    private readonly client: SteamClient,
    private readonly openId: SteamOpenId,
  ) {}

  /** `ctx.returnTo` é o endereço-base da rota de retorno; o `state` entra na query (e volta idêntico). */
  iniciarVinculo(ctx: { state: string; returnTo: string; realm: string }): { url: string } {
    return {
      url: this.openId.montarUrl({
        returnTo: this.returnToCompleto(ctx.returnTo, ctx.state),
        realm: ctx.realm,
      }),
    };
  }

  /**
   * Confirma o retorno na Steam e devolve o SteamID (já comprovado) e o nome. Falha ao ler o nome NÃO desfaz
   * o vínculo: a identidade já está provada, e o nome se corrige na próxima leitura do perfil (CA-14).
   */
  async concluirVinculo(
    query: Record<string, string>,
    ctx: { returnTo: string },
  ): Promise<{ idExterno: string; nomeExibicao: string }> {
    const state: unknown = query.state;
    if (typeof state !== 'string' || state === '') {
      throw new OpenIdInvalidoError('state ausente');
    }
    const idExterno = await this.openId.validarRetorno(
      query,
      this.returnToCompleto(ctx.returnTo, state),
    );

    let nome: string | null = null;
    try {
      nome = (await this.client.obterPerfil(idExterno))?.nome ?? null;
    } catch (error) {
      if (!(error instanceof PlataformaError)) {
        throw error;
      }
    }
    return { idExterno, nomeExibicao: this.nomeDeExibicao(nome) };
  }

  /**
   * SIMULADO, sem fixture real (CA-63): "privado" = visibilidade ≠ 3 ou biblioteca sem `game_count`.
   * A biblioteca e o perfil, na mesma consulta. Perfil que não é público, ou biblioteca sem `game_count`
   * ("detalhes do jogo" privados), é `PerfilPrivadoError`. Biblioteca pública e vazia NÃO é erro.
   */
  async listarBiblioteca(
    idExterno: string,
  ): Promise<{ itens: ItemDaBiblioteca[]; perfil: PerfilBasico }> {
    const [perfil, biblioteca] = await Promise.all([
      this.client.obterPerfil(idExterno),
      this.client.listarJogos(idExterno),
    ]);
    if (perfil === null) {
      // A Steam não conhece mais o ID: não há o que mostrar, e "privado" seria uma informação falsa.
      throw new PlataformaIndisponivelError('A Steam não devolveu o perfil');
    }
    if (perfil.visibilidade !== STEAM_VISIBILIDADE_PUBLICA || biblioteca.privada) {
      throw new PerfilPrivadoError();
    }
    return {
      itens: biblioteca.jogos.map((jogo) => ({
        idExterno: jogo.appid,
        titulo: jogo.nome,
        capaUrl: capaOficialUrl(jogo.appid),
        minutosJogados: jogo.minutosJogados,
        ultimaVezJogadoEm: jogo.ultimaVezJogadoEm,
      })),
      perfil: {
        nomeExibicao: this.nomeDeExibicao(perfil.nome),
        avatarUrl: avatarUrlSeguro(perfil.avatarUrl),
        perfilUrl: perfilUrlSeguro(perfil.perfilUrl),
        publico: true,
        membroDesdeAno: anoDaCriacao(perfil.criadoEmUnix),
        status: statusDaSteam(perfil.estado, perfil.jogandoAgora),
        jogandoAgora: perfil.jogandoAgora ?? null,
      },
    };
  }

  /**
   * O RESUMO de um jogo (etapa 3 da spec): horas, última vez jogado, capa e as contagens de conquistas, mais o
   * aviso de privacidade. A lista completa de conquistas (schema e raridade) é da etapa 4: `conquistas` vem vazia.
   *
   * Duas chamadas, uma depois da outra e só se a primeira der certo: (1) a biblioteca filtrada pelo appid, que
   * confere que o jogo é do usuário e traz as horas; (2) `GetPlayerAchievements`, para as contagens. Biblioteca
   * privada → `PerfilPrivadoError`; appid fora da biblioteca → `PlataformaItemNaoEncontradoError`. Conquistas
   * negadas NÃO derrubam o resumo (contagens `null` e o aviso `CONQUISTAS_PRIVADAS`); jogo sem conquistas dá
   * `0` de `0` e `SEM_CONQUISTAS`. Falha da Steam (502) sobe: quem grava decide não gravar nada.
   */
  async obterJogo(
    idExterno: string,
    idJogo: string,
  ): Promise<{ dados: DadosDoJogo; conquistas: Conquista[]; aviso: AvisoPlataforma | null }> {
    const biblioteca = await this.client.listarJogos(idExterno, { appId: idJogo });
    if (biblioteca.privada) {
      throw new PerfilPrivadoError();
    }
    const jogo = biblioteca.jogos.find((candidato) => candidato.appid === idJogo);
    if (!jogo) {
      throw new PlataformaItemNaoEncontradoError();
    }

    const conquistas = await this.client.obterConquistasDoJogador(idExterno, idJogo);
    let total: number | null = null;
    let desbloqueadas: number | null = null;
    let aviso: AvisoPlataforma | null = null;
    if (conquistas.tipo === 'ok') {
      total = conquistas.conquistas.length;
      desbloqueadas = conquistas.conquistas.filter((conquista) => conquista.desbloqueada).length;
    } else if (conquistas.tipo === 'sem-conquistas') {
      total = 0;
      desbloqueadas = 0;
      aviso = 'SEM_CONQUISTAS';
    } else {
      aviso = 'CONQUISTAS_PRIVADAS';
    }

    return {
      dados: {
        idExterno: jogo.appid,
        minutosJogados: jogo.minutosJogados,
        ultimaVezJogadoEm: jogo.ultimaVezJogadoEm,
        conquistasTotal: total,
        conquistasDesbloqueadas: desbloqueadas,
        capaUrl: capaOficialUrl(jogo.appid),
      },
      conquistas: [],
      aviso,
    };
  }

  /**
   * O detalhe completo de um jogo (etapa 4). No máximo 4 chamadas, todas opcionais conforme o cache: (1) as horas
   * (biblioteca filtrada pelo appid), só com `comHoras`; (2) as conquistas do jogador (cache de 5 min);
   * (3) o schema e (4) os percentuais (24 h, por appid). Schema e percentuais são enfeite: se falharem, o nome
   * cai para o do jogador (ou o id) e a raridade fica `null`, sem derrubar o detalhe.
   *
   * "Negado" (403 ou `success:false` do `GetPlayerAchievements`) é SIMULADO, sem fixture real (CA-63): dá o aviso
   * `CONQUISTAS_PRIVADAS`, com as contagens `null`. Um 403 em QUALQUER outra chamada é `PlataformaIndisponivelError`
   * (problema com a chave, não com a privacidade do jogador), como o `SteamClient` já faz.
   */
  async obterDetalhe(
    idExterno: string,
    idJogo: string,
    opcoes: OpcoesDoDetalhe,
  ): Promise<DetalheDoJogo> {
    let horas: DetalheDoJogo['horas'] = null;
    if (opcoes.comHoras) {
      const biblioteca = await this.client.listarJogos(idExterno, { appId: idJogo });
      if (biblioteca.privada) {
        throw new PerfilPrivadoError();
      }
      const jogo = biblioteca.jogos.find((candidato) => candidato.appid === idJogo);
      if (!jogo) {
        throw new PlataformaItemNaoEncontradoError();
      }
      horas = {
        minutosJogados: jogo.minutosJogados,
        ultimaVezJogadoEm: jogo.ultimaVezJogadoEm,
        capaUrl: capaOficialUrl(jogo.appid),
      };
    }

    const jogador = await this.conquistasDoJogador.obter(
      `${idExterno}:${idJogo}`,
      () => this.client.obterConquistasDoJogador(idExterno, idJogo),
      { ignorarCache: opcoes.ignorarCache },
    );
    if (jogador.tipo === 'negado') {
      return {
        horas,
        conquistasTotal: null,
        conquistasDesbloqueadas: null,
        conquistas: [],
        aviso: 'CONQUISTAS_PRIVADAS',
      };
    }
    if (jogador.tipo === 'sem-conquistas') {
      return {
        horas,
        conquistasTotal: 0,
        conquistasDesbloqueadas: 0,
        conquistas: [],
        aviso: 'SEM_CONQUISTAS',
      };
    }

    const [schema, percentuais] = await Promise.all([
      this.enfeite(() => this.schemas.obter(idJogo, () => this.client.obterSchema(idJogo))),
      this.enfeite(() =>
        this.percentuais.obter(idJogo, () => this.client.obterPercentuaisGlobais(idJogo)),
      ),
    ]);
    const doSchema = new Map((schema ?? []).map((item) => [item.id, item]));

    const conquistas: Conquista[] = jogador.conquistas.map((item) => {
      const extra = doSchema.get(item.id);
      return {
        id: item.id,
        nome: extra?.nome ?? item.nome ?? item.id,
        descricao: extra?.descricao ?? item.descricao,
        oculta: extra?.oculta ?? false,
        desbloqueada: item.desbloqueada,
        desbloqueadaEm: item.desbloqueadaEm ? item.desbloqueadaEm.toISOString() : null,
        iconeUrl: iconeUrlSeguro(
          (item.desbloqueada ? extra?.iconeUrl : extra?.iconeCinzaUrl) ?? extra?.iconeUrl ?? null,
        ),
        raridadePercentual: percentuais?.get(item.id) ?? null,
      };
    });
    return {
      horas,
      conquistasTotal: conquistas.length,
      conquistasDesbloqueadas: conquistas.filter((conquista) => conquista.desbloqueada).length,
      conquistas,
      aviso: null,
    };
  }

  /** Falha da plataforma no enfeite vira `null`; erro de programação (ID inválido etc.) continua subindo. */
  private async enfeite<T>(carregar: () => Promise<T>): Promise<T | null> {
    try {
      return await carregar();
    } catch (error) {
      if (error instanceof PlataformaError) {
        return null;
      }
      throw error;
    }
  }

  private returnToCompleto(base: string, state: string): string {
    return `${base}?state=${encodeURIComponent(state)}`;
  }

  private nomeDeExibicao(nome: string | null): string {
    const aparado = (nome ?? '').trim();
    return aparado === '' ? NOME_PADRAO_DA_CONTA : aparado.slice(0, NOME_MAX);
  }
}

/** O ano (UTC) de `timecreated`; ausente ou inválido vira `null`. */
export function anoDaCriacao(criadoEmUnix: number | null | undefined): number | null {
  if (typeof criadoEmUnix !== 'number' || !Number.isFinite(criadoEmUnix) || criadoEmUnix <= 0) {
    return null;
  }
  return new Date(criadoEmUnix * 1000).getUTCFullYear();
}

/** `gameextrainfo` presente = em jogo; senão `personastate` 0 é offline e qualquer outro valor é online. */
export function statusDaSteam(
  estado: number | null | undefined,
  jogandoAgora: string | null | undefined,
): StatusNaPlataforma | null {
  if (jogandoAgora) {
    return 'jogando';
  }
  if (typeof estado !== 'number') {
    return null;
  }
  return estado === 0 ? 'offline' : 'online';
}
