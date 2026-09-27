import { Injectable } from '@nestjs/common';
import {
  type AvisoPlataforma,
  type Conquista,
  type ContagemTrofeus,
  type RaridadeDoTrofeu,
  type TipoDeTrofeu,
} from '@checkpoint/shared';
import { CarregadorEmCache } from '../cache/carregador-em-cache';
import { TtlCache } from '../cache/ttl-cache';
import {
  CACHE_MAX_ENTRIES,
  LIBRARY_CACHE_TTL_MS,
  PSN_DEFINICOES_CACHE_TTL_MS,
  PSN_GANHOS_CACHE_TTL_MS,
  PSN_MAPA_TITULO_CACHE_TTL_MS,
} from '../integrations.constants';
import {
  type ContextoDaConta,
  type DadosDoJogo,
  type DetalheDoJogo,
  type GameProvider,
  type ItemDaBiblioteca,
  type OpcoesDoDetalhe,
  type PerfilBasico,
  type SessaoDaPlataforma,
} from '../providers/game-provider';
import {
  CredencialInvalidaError,
  IdExternoInvalidoError,
  PlataformaItemNaoEncontradoError,
  PlataformaReautenticarError,
  VinculoRecusadoError,
} from '../providers/plataforma-errors';
import { PsnSessao } from './psn-sessao';
import { imagemUrlSegura } from './psn-urls';
import {
  PsnClient,
  type PsnCategoria,
  type PsnContagem,
  type PsnDefinicaoDeTrofeu,
  type PsnGanhoDeTrofeu,
  type PsnJogo,
  type PsnServico,
} from './psn.client';

/** O nome guardado no vínculo quando a Sony não devolve um (a coluna cabe 80 caracteres). */
export const NOME_PADRAO_DA_CONTA_PSN = 'Conta PlayStation';
const NOME_MAX = 80;

/** `CUSA12345_00` (PS4) ou `PPSA01234_00` (PS5): 4 letras, 5 dígitos, `_`, 2 dígitos. */
const TITLE_ID_PATTERN = /^[A-Z]{4}\d{5}_\d{2}$/;

const SUGESTAO_DE_PLATAFORMA: Record<PsnCategoria, string | null> = {
  ps4_game: 'PS4',
  ps5_native_game: 'PS5',
  pspc_game: 'PC',
  unknown: null,
};

const RARIDADE: Record<number, RaridadeDoTrofeu> = {
  0: 'ultrarraro',
  1: 'muito-raro',
  2: 'raro',
  3: 'comum',
};

const TIPOS: readonly TipoDeTrofeu[] = ['platina', 'ouro', 'prata', 'bronze'];

interface MapaDoTitulo {
  npCommunicationId: string;
  servico: PsnServico;
}

function soma(c: PsnContagem): number {
  return c.platina + c.ouro + c.prata + c.bronze;
}

/**
 * A PlayStation como `GameProvider` (spec integracao-playstation). Junta o `PsnClient` (ler a Sony) e a `PsnSessao`
 * (o token de cada conta) e traduz para o vocabulário neutro da interface. O item da biblioteca é o `titleId`
 * (PS4 e PS5 do mesmo jogo são itens distintos, nada os agrupa) e a conta é o `accountId`. Não conhece HTTP nem
 * grava nada: quem persiste e responde é o service.
 */
@Injectable()
export class PsnProvider implements GameProvider {
  readonly id = 'PLAYSTATION' as const;
  readonly modoDeVinculo = 'credencial' as const;

  // Os jogos jogados por accountId (10 min): `ligar` e o detalhe filtram esta lista em vez de reconsultar.
  private readonly jogados = new CarregadorEmCache<PsnJogo[]>(
    LIBRARY_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );
  // Dado do JOGO (dividido entre usuários, 24 h): o mapa titleId → conjunto de troféus e as definições.
  private readonly mapas = new TtlCache<MapaDoTitulo>(
    PSN_MAPA_TITULO_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );
  private readonly definicoes = new CarregadorEmCache<PsnDefinicaoDeTrofeu[]>(
    PSN_DEFINICOES_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );
  // Dado do USUÁRIO (5 min): o que ele ganhou de cada troféu do jogo.
  private readonly ganhos = new CarregadorEmCache<PsnGanhoDeTrofeu[]>(
    PSN_GANHOS_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );

  constructor(
    private readonly client: PsnClient,
    private readonly sessao: PsnSessao,
  ) {}

  /** A PlayStation não vincula por redirecionamento: o service nunca chama isto (consulta `modoDeVinculo`). */
  iniciarVinculo(): { url: string } {
    throw new VinculoRecusadoError(
      'a PlayStation vincula por credencial, não por redirecionamento',
    );
  }

  concluirVinculo(): Promise<{ idExterno: string; nomeExibicao: string }> {
    return Promise.reject(
      new VinculoRecusadoError('a PlayStation vincula por credencial, não por redirecionamento'),
    );
  }

  /**
   * NPSSO → sessão. O NPSSO só existe dentro desta função: é trocado pelos tokens e descartado. Falhar ao ler o nome
   * NÃO desfaz o vínculo (a identidade já está provada), como na Steam.
   */
  async vincularComCredencial(
    credencial: string,
  ): Promise<{ idExterno: string; nomeExibicao: string; sessao: SessaoDaPlataforma }> {
    const tokens = await this.client.trocarNpsso(credencial);
    let accountId: string;
    try {
      ({ accountId } = await this.client.resumoDeTrofeus(tokens.accessToken));
    } catch (erro) {
      // Um token recém-emitido recusado é sinal de credencial ruim, não de "conexão expirada".
      throw erro instanceof PlataformaReautenticarError ? new CredencialInvalidaError() : erro;
    }
    let nome: string | null = null;
    try {
      nome = (await this.client.perfil(tokens.accessToken)).onlineId;
    } catch {
      // Só rótulo: o nome se corrige na próxima leitura do perfil.
    }
    return {
      idExterno: accountId,
      nomeExibicao: this.nomeDeExibicao(nome),
      sessao: { refreshToken: tokens.refreshToken, expiraEm: tokens.refreshExpiraEm },
    };
  }

  /** A biblioteca (um item por `titleId`) e o perfil com o nível e a contagem de troféus da conta. Sempre consulta. */
  async listarBiblioteca(
    idExterno: string,
    ctx: ContextoDaConta,
  ): Promise<{ itens: ItemDaBiblioteca[]; perfil: PerfilBasico }> {
    this.client.validarAccountId(idExterno);
    return this.sessao.comToken(ctx.contaId, async (token) => {
      const [jogos, resumo, perfil] = await Promise.all([
        this.jogados.obter(idExterno, () => this.client.jogados(token), { ignorarCache: true }),
        this.client.resumoDeTrofeus(token),
        // O perfil só enfeita (nome e foto): falhar aqui não derruba a biblioteca.
        this.client.perfil(token).catch(() => null),
      ]);
      const itens = jogos.map((jogo): ItemDaBiblioteca => ({
        idExterno: jogo.titleId,
        titulo: jogo.nome,
        capaUrl: imagemUrlSegura(jogo.imagemUrl),
        plataformaSugerida: SUGESTAO_DE_PLATAFORMA[jogo.categoria],
        minutosJogados: jogo.minutosJogados,
        ultimaVezJogadoEm: jogo.ultimaVezJogadoEm,
      }));
      return {
        itens,
        perfil: {
          nomeExibicao: this.nomeDeExibicao(perfil?.onlineId ?? null, ctx.nomeExibicao),
          avatarUrl: imagemUrlSegura(perfil?.avatarUrl),
          perfilUrl: null,
          // Age como o próprio usuário: a privacidade do perfil não bloqueia a leitura dos dados dele (hipótese [~]).
          publico: true,
          nivel: {
            valor: resumo.nivel,
            progressoPercentual: resumo.progressoPercentual,
            faixa: resumo.faixa,
          },
          trofeus: resumo.trofeus,
        },
      };
    });
  }

  async obterJogo(
    idExterno: string,
    idJogo: string,
    ctx: ContextoDaConta,
  ): Promise<{ dados: DadosDoJogo; conquistas: Conquista[]; aviso: AvisoPlataforma | null }> {
    this.client.validarAccountId(idExterno);
    this.validarTitleId(idJogo);
    return this.sessao.comToken(ctx.contaId, async (token) => {
      const jogo = await this.doJogo(token, idExterno, idJogo, false);
      if (!jogo) {
        throw new PlataformaItemNaoEncontradoError();
      }
      const conjunto = await this.client.conjuntoDeTrofeus(token, idJogo);
      if (conjunto) {
        this.mapas.set(idJogo, {
          npCommunicationId: conjunto.npCommunicationId,
          servico: conjunto.servico,
        });
      }
      const total = conjunto ? soma(conjunto.definidos) : 0;
      return {
        dados: {
          idExterno: idJogo,
          minutosJogados: jogo.minutosJogados,
          ultimaVezJogadoEm: jogo.ultimaVezJogadoEm,
          conquistasTotal: total,
          conquistasDesbloqueadas: conjunto ? soma(conjunto.ganhos) : 0,
          capaUrl: imagemUrlSegura(jogo.imagemUrl),
        },
        conquistas: [],
        aviso: total === 0 ? 'SEM_CONQUISTAS' : null,
      };
    });
  }

  async obterDetalhe(
    idExterno: string,
    idJogo: string,
    opcoes: OpcoesDoDetalhe,
    ctx: ContextoDaConta,
  ): Promise<DetalheDoJogo> {
    this.client.validarAccountId(idExterno);
    this.validarTitleId(idJogo);
    return this.sessao.comToken(ctx.contaId, async (token) => {
      let horas: DetalheDoJogo['horas'] = null;
      if (opcoes.comHoras) {
        const jogo = await this.doJogo(token, idExterno, idJogo, opcoes.ignorarCache);
        if (!jogo) {
          throw new PlataformaItemNaoEncontradoError();
        }
        horas = {
          minutosJogados: jogo.minutosJogados,
          ultimaVezJogadoEm: jogo.ultimaVezJogadoEm,
          capaUrl: imagemUrlSegura(jogo.imagemUrl),
        };
      }

      const mapa = await this.mapaDoTitulo(token, idJogo);
      if (!mapa) {
        return {
          horas,
          conquistasTotal: 0,
          conquistasDesbloqueadas: 0,
          conquistas: [],
          aviso: 'SEM_CONQUISTAS',
          porTipo: null,
        };
      }
      const [definicoes, ganhos] = await Promise.all([
        this.definicoes.obter(mapa.npCommunicationId, () =>
          this.client.definicoesDeTrofeus(token, mapa.npCommunicationId, mapa.servico),
        ),
        this.ganhos.obter(
          `${idExterno}:${mapa.npCommunicationId}`,
          () => this.client.ganhosDeTrofeus(token, mapa.npCommunicationId, mapa.servico),
          { ignorarCache: opcoes.ignorarCache },
        ),
      ]);
      return this.montarDetalhe(horas, definicoes, ganhos);
    });
  }

  private montarDetalhe(
    horas: DetalheDoJogo['horas'],
    definicoes: PsnDefinicaoDeTrofeu[],
    ganhos: PsnGanhoDeTrofeu[],
  ): DetalheDoJogo {
    const porId = new Map(ganhos.map((ganho) => [ganho.id, ganho]));
    const porTipo = Object.fromEntries(
      TIPOS.map((tipo) => [tipo, { total: 0, desbloqueados: 0 } satisfies ContagemTrofeus]),
    ) as Record<TipoDeTrofeu, ContagemTrofeus>;

    const conquistas: Conquista[] = definicoes.map((def) => {
      const ganho = porId.get(def.id);
      const desbloqueada = ganho?.ganho === true;
      porTipo[def.tipo].total += 1;
      if (desbloqueada) {
        porTipo[def.tipo].desbloqueados += 1;
      }
      // Troféu oculto e ainda bloqueado: nem o nome nem a descrição saem da API, qualquer que seja a resposta da Sony.
      const escondido = def.oculto && !desbloqueada;
      return {
        id: String(def.id),
        nome: escondido ? '' : (def.nome ?? String(def.id)),
        descricao: escondido ? null : def.descricao,
        oculta: def.oculto,
        desbloqueada,
        desbloqueadaEm: desbloqueada && ganho?.ganhoEm ? ganho.ganhoEm.toISOString() : null,
        iconeUrl: escondido ? null : imagemUrlSegura(def.iconeUrl),
        raridadePercentual:
          ganho?.taxaPercentual === null || ganho?.taxaPercentual === undefined
            ? null
            : Math.round(ganho.taxaPercentual * 10) / 10,
        tipo: def.tipo,
        raridadeNivel:
          ganho?.raridade === null || ganho?.raridade === undefined
            ? null
            : (RARIDADE[ganho.raridade] ?? null),
      };
    });
    return {
      horas,
      conquistasTotal: conquistas.length,
      conquistasDesbloqueadas: conquistas.filter((c) => c.desbloqueada).length,
      conquistas,
      aviso: conquistas.length === 0 ? 'SEM_CONQUISTAS' : null,
      porTipo,
    };
  }

  /** O jogo na lista de jogados (do cache de 10 min, ou consultando). `null` = o item não é do usuário. */
  private async doJogo(
    token: string,
    accountId: string,
    titleId: string,
    ignorarCache: boolean,
  ): Promise<PsnJogo | null> {
    const jogos = await this.jogados.obter(accountId, () => this.client.jogados(token), {
      ignorarCache,
    });
    return jogos.find((jogo) => jogo.titleId === titleId) ?? null;
  }

  /** `titleId` → o conjunto de troféus (dado do jogo, 24 h). `null` = a Sony não tem (nunca sincronizou); não fica no cache. */
  private async mapaDoTitulo(token: string, titleId: string): Promise<MapaDoTitulo | null> {
    const guardado = this.mapas.get(titleId);
    if (guardado) {
      return guardado;
    }
    const conjunto = await this.client.conjuntoDeTrofeus(token, titleId);
    if (!conjunto) {
      return null;
    }
    const mapa = { npCommunicationId: conjunto.npCommunicationId, servico: conjunto.servico };
    this.mapas.set(titleId, mapa);
    return mapa;
  }

  private validarTitleId(titleId: string): void {
    if (typeof titleId !== 'string' || !TITLE_ID_PATTERN.test(titleId)) {
      throw new IdExternoInvalidoError(
        'idItem',
        'O titleId da PlayStation deve ser como PPSA01234_00',
      );
    }
  }

  private nomeDeExibicao(nome: string | null, padrao: string = NOME_PADRAO_DA_CONTA_PSN): string {
    const aparado = (nome ?? '').trim();
    return aparado === '' ? padrao : aparado.slice(0, NOME_MAX);
  }
}
