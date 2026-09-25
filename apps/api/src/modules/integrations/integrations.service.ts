import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ATUALIZACAO_MANUAL_MIN_MS,
  PROVEDOR_SLUG,
  chaveDeTitulo,
  type ContaVinculada,
  type IniciarVinculoResponse,
  type ItemBiblioteca,
  type JogoParecido,
  type PerfilPlataforma,
  type Provedor,
} from '@checkpoint/shared';
import { API_GLOBAL_PREFIX } from '../../config/app.config';
import { type EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import { TtlCache } from './cache/ttl-cache';
import {
  BIBLIOTECA_LIMITE_PADRAO,
  CACHE_MAX_ENTRIES,
  LIBRARY_CACHE_TTL_MS,
  MAIS_JOGADOS_NO_CARTAO,
  MAX_JOGOS_PARECIDOS,
} from './integrations.constants';
import { integracaoErrors } from './plataforma-http-errors';
import { type ItemDaBiblioteca, type PerfilBasico } from './providers/game-provider';
import {
  PlataformaError,
  VinculoCanceladoError,
  VinculoRecusadoError,
} from './providers/plataforma-errors';
import { ProviderRegistry } from './providers/provider-registry';
import { VinculoExpiradoError, VinculoStateService } from './vinculo/vinculo-state.service';

/** Por que o retorno do vínculo falhou: vai na URL (`?steam=erro&motivo=…`) e o web tem um texto para cada. */
export type MotivoDoRetorno =
  'cancelado' | 'invalido' | 'expirado' | 'indisponivel' | 'ja-vinculada';

export type ResultadoDoRetorno =
  { resultado: 'vinculada' } | { resultado: 'erro'; motivo: MotivoDoRetorno };

interface BibliotecaEmCache {
  itens: ItemDaBiblioteca[];
  /** `chaveDeTitulo` de cada item, na mesma ordem (calculada uma vez, na consulta). */
  chaves: string[];
  perfil: PerfilBasico;
  consultadoEm: number;
}

const CONTA_SELECT = {
  provedor: true,
  idExterno: true,
  nomeExibicao: true,
  vinculadaEm: true,
} as const;

/**
 * As integrações com plataformas de jogos (spec `integracao-plataformas`): vincular a conta, ler o perfil e
 * desvincular. Não conhece a Steam: só a interface `GameProvider`, pelo `ProviderRegistry`. Toda consulta
 * filtra por `userId`. Lança erros de DOMÍNIO (`plataforma-errors`), que o filtro do controller traduz em 409,
 * 502 ou 400; o retorno do OpenID nunca lança, porque termina num redirecionamento.
 *
 * Nada aqui loga o SteamID nem o `state`: os logs têm só o motivo.
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  /** Por SteamID (dado público): duas contas do checkpoint com a mesma Steam dividem a consulta. */
  private readonly bibliotecas = new TtlCache<BibliotecaEmCache>(
    LIBRARY_CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly vinculoState: VinculoStateService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async listarContas(userId: string): Promise<ContaVinculada[]> {
    const contas = await this.prisma.contaVinculada.findMany({
      where: { userId },
      select: CONTA_SELECT,
      orderBy: { vinculadaEm: 'asc' },
    });
    return contas.map((conta) => ({
      provedor: conta.provedor,
      idExterno: conta.idExterno,
      nomeExibicao: conta.nomeExibicao,
      vinculadaEm: conta.vinculadaEm.toISOString(),
    }));
  }

  /** O `state` vai na URL da Steam; o `nonce`, no cookie (quem chama o grava). Já vinculado → 409. */
  async iniciarVinculo(
    userId: string,
    provedor: Provedor,
  ): Promise<{ resposta: IniciarVinculoResponse; nonce: string }> {
    const provider = this.registry.porProvedor(provedor);
    if (await this.contaDe(userId, provedor)) {
      throw integracaoErrors.jaVinculada();
    }
    const { state, nonce } = await this.vinculoState.emitir(userId, provedor);
    const { url } = provider.iniciarVinculo({
      state,
      returnTo: this.returnToBase(provedor),
      realm: this.apiPublicUrl(),
    });
    return { resposta: { url }, nonce };
  }

  /**
   * Conclui o retorno do navegador. A ORDEM importa e é a defesa: (1) o `state` confere e não venceu; (2) o
   * nonce do cookie é o do `state` (amarra ao navegador que iniciou); só (3) chama a plataforma. Um `state`
   * ruim, ou sem o cookie, nunca gasta uma chamada de rede. Não lança: todo desfecho vira um resultado.
   */
  async concluirVinculo(
    provedor: Provedor,
    query: Record<string, unknown>,
    nonceDoCookie: string | undefined,
  ): Promise<ResultadoDoRetorno> {
    const provider = this.registry.porProvedor(provedor);

    const state = query.state;
    if (typeof state !== 'string' || state === '') {
      return this.recusar(provedor, 'invalido');
    }

    let userId: string;
    let nonce: string;
    try {
      ({ userId, nonce } = await this.vinculoState.verificar(state, provedor));
    } catch (error) {
      return this.recusar(
        provedor,
        error instanceof VinculoExpiradoError ? 'expirado' : 'invalido',
      );
    }
    if (!VinculoStateService.nonceConfere(nonceDoCookie, nonce)) {
      return this.recusar(provedor, 'invalido');
    }

    let conta: { idExterno: string; nomeExibicao: string };
    try {
      conta = await provider.concluirVinculo(query as Record<string, string>, {
        returnTo: this.returnToBase(provedor),
      });
    } catch (error) {
      if (error instanceof VinculoCanceladoError) {
        return this.recusar(provedor, 'cancelado');
      }
      if (error instanceof VinculoRecusadoError) {
        return this.recusar(provedor, 'invalido');
      }
      if (error instanceof PlataformaError) {
        return this.recusar(provedor, 'indisponivel');
      }
      throw error;
    }

    return this.gravarConta(userId, provedor, conta);
  }

  /**
   * Desfaz a camada da plataforma: apaga a conta vinculada e TODOS os dados por provedor dos jogos, numa
   * transação. Os jogos, notas, status, descrição e capas do usuário não são tocados.
   */
  async desvincular(userId: string, provedor: Provedor): Promise<void> {
    if (!(await this.contaDe(userId, provedor))) {
      throw integracaoErrors.naoVinculada();
    }
    await this.prisma.$transaction([
      this.prisma.jogoPlataforma.deleteMany({ where: { userId, provedor } }),
      this.prisma.contaVinculada.deleteMany({ where: { userId, provedor } }),
    ]);
  }

  /**
   * O cartão do `/perfil`. A biblioteca vem da plataforma (cache de 10 min); as conquistas são a SOMA dos jogos
   * vinculados, já gravada no banco, sem chamada extra. Com `atualizar`, ignora o cache, mas no máximo uma
   * consulta a cada 30 s: antes disso devolve o que já tem (sem gastar a cota).
   */
  async perfil(
    userId: string,
    provedor: Provedor,
    opcoes: { atualizar?: boolean } = {},
  ): Promise<PerfilPlataforma> {
    const conta = await this.contaDe(userId, provedor);
    if (!conta) {
      throw integracaoErrors.naoVinculada();
    }
    const biblioteca = await this.obterBiblioteca(userId, provedor, conta, opcoes);

    return {
      provedor,
      nomeExibicao: biblioteca.perfil.nomeExibicao,
      avatarUrl: biblioteca.perfil.avatarUrl,
      perfilUrl: biblioteca.perfil.perfilUrl,
      totalJogos: biblioteca.itens.length,
      minutosTotais: biblioteca.itens.reduce((soma, item) => soma + item.minutosJogados, 0),
      maisJogados: this.maisJogados(biblioteca.itens),
      conquistas: await this.conquistasDosJogosVinculados(userId, provedor),
      consultadoEm: new Date(biblioteca.consultadoEm).toISOString(),
    };
  }

  /**
   * A biblioteca do diálogo "Buscar na Steam" (etapa 3). Usa o MESMO cache de 10 min do cartão do perfil:
   * abrir o diálogo logo depois do `/perfil` não chama a plataforma. Sem paginação: `busca` (por trecho da
   * `chaveDeTitulo`, sem caixa nem acento) e `limite` (padrão 30) mantêm a resposta pequena, ordenada por horas
   * e, no empate, por título. Cada item traz os jogos do catálogo que PARECEM ser o mesmo (mesma chave de
   * título, sem vínculo, até 3) e o jogo ao qual já está ligado. Nunca vincula nada: só informa.
   */
  async biblioteca(
    userId: string,
    provedor: Provedor,
    query: { busca?: string; limite?: number } = {},
  ): Promise<ItemBiblioteca[]> {
    const conta = await this.contaDe(userId, provedor);
    if (!conta) {
      throw integracaoErrors.naoVinculada();
    }
    const biblioteca = await this.obterBiblioteca(userId, provedor, conta);

    const buscada = chaveDeTitulo(query.busca ?? '');
    const escolhidos = biblioteca.itens
      .map((item, indice) => ({ item, chave: biblioteca.chaves[indice] ?? '' }))
      .filter(({ chave }) => buscada === '' || chave.includes(buscada))
      .sort(
        (a, b) =>
          b.item.minutosJogados - a.item.minutosJogados ||
          a.item.titulo.localeCompare(b.item.titulo, 'pt-BR'),
      )
      .slice(0, query.limite ?? BIBLIOTECA_LIMITE_PADRAO);
    if (escolhidos.length === 0) {
      return [];
    }

    const [jogos, vinculos] = await Promise.all([
      this.prisma.game.findMany({
        where: { userId },
        select: { id: true, titulo: true, plataforma: true },
      }),
      this.prisma.jogoPlataforma.findMany({
        where: { userId, provedor },
        select: { gameId: true, idExterno: true },
      }),
    ]);
    const porId = new Map<string, JogoParecido>(
      jogos.map((jogo) => [
        jogo.id,
        {
          id: jogo.id,
          titulo: jogo.titulo,
          plataforma: jogo.plataforma === '' ? null : jogo.plataforma,
        },
      ]),
    );
    const gameDoItem = new Map(vinculos.map((vinculo) => [vinculo.idExterno, vinculo.gameId]));
    const ligados = new Set(vinculos.map((vinculo) => vinculo.gameId));
    const livresPorChave = new Map<string, JogoParecido[]>();
    for (const jogo of porId.values()) {
      if (ligados.has(jogo.id)) {
        continue;
      }
      const chave = chaveDeTitulo(jogo.titulo);
      livresPorChave.set(chave, [...(livresPorChave.get(chave) ?? []), jogo]);
    }

    return escolhidos.map(({ item, chave }) => {
      const donoId = gameDoItem.get(item.idExterno);
      const vinculadoA = donoId === undefined ? null : (porId.get(donoId) ?? null);
      return {
        idExterno: item.idExterno,
        titulo: item.titulo,
        capaUrl: item.capaUrl,
        minutosJogados: item.minutosJogados,
        ultimaVezJogadoEm: item.ultimaVezJogadoEm?.toISOString() ?? null,
        // Um item já ligado não tem o que sugerir (é 1 para 1): "mover" é outro caminho.
        jogosParecidos:
          vinculadoA || chave === ''
            ? []
            : (livresPorChave.get(chave) ?? []).slice(0, MAX_JOGOS_PARECIDOS),
        vinculadoA,
      };
    });
  }

  /**
   * A biblioteca e o perfil da plataforma, do cache (10 min, por SteamID) ou consultando. Erro (privado, 502) não
   * entra no cache. `atualizar` ignora o cache, mas no máximo uma consulta a cada 30 s.
   */
  private async obterBiblioteca(
    userId: string,
    provedor: Provedor,
    conta: { idExterno: string; nomeExibicao: string },
    opcoes: { atualizar?: boolean } = {},
  ): Promise<BibliotecaEmCache> {
    const provider = this.registry.porProvedor(provedor);
    const chave = `${provedor}:${conta.idExterno}`;
    const agora = Date.now();
    const emCache = this.bibliotecas.get(chave);
    if (
      emCache &&
      !(opcoes.atualizar === true && agora - emCache.consultadoEm >= ATUALIZACAO_MANUAL_MIN_MS)
    ) {
      return emCache;
    }
    const { itens, perfil } = await provider.listarBiblioteca(conta.idExterno);
    const entrada: BibliotecaEmCache = {
      itens,
      chaves: itens.map((item) => chaveDeTitulo(item.titulo)),
      perfil,
      consultadoEm: agora,
    };
    this.bibliotecas.set(chave, entrada);
    await this.corrigirNome(userId, provedor, conta.nomeExibicao, perfil.nomeExibicao);
    return entrada;
  }

  /** Para onde o navegador volta depois do retorno: sem o SteamID, o `state` nem qualquer dado do usuário. */
  urlDoRedirecionamento(resultado: ResultadoDoRetorno): string {
    const base = `${this.webPublicUrl()}/perfil`;
    return resultado.resultado === 'vinculada'
      ? `${base}?steam=vinculada`
      : `${base}?steam=erro&motivo=${resultado.motivo}`;
  }

  private contaDe(userId: string, provedor: Provedor) {
    return this.prisma.contaVinculada.findUnique({
      where: { userId_provedor: { userId, provedor } },
      select: { idExterno: true, nomeExibicao: true },
    });
  }

  /** Mesmo SteamID → sucesso sem duplicar; outro SteamID → "ja-vinculada". A unicidade real é a do banco. */
  private async gravarConta(
    userId: string,
    provedor: Provedor,
    conta: { idExterno: string; nomeExibicao: string },
  ): Promise<ResultadoDoRetorno> {
    try {
      const existente = await this.contaDe(userId, provedor);
      if (existente) {
        return this.reconciliar(userId, provedor, existente.idExterno, conta);
      }
      await this.prisma.contaVinculada.create({
        data: {
          userId,
          provedor,
          idExterno: conta.idExterno,
          nomeExibicao: conta.nomeExibicao,
        },
        select: { id: true },
      });
      return { resultado: 'vinculada' };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        // Corrida: outra volta do mesmo usuário gravou primeiro. Reavalia contra o que ficou.
        const gravada = await this.contaDe(userId, provedor);
        return gravada
          ? this.reconciliar(userId, provedor, gravada.idExterno, conta)
          : this.recusar(provedor, 'invalido');
      }
      if (code === 'P2003') {
        // O usuário deixou de existir entre o início e o retorno.
        return this.recusar(provedor, 'invalido');
      }
      throw error;
    }
  }

  private async reconciliar(
    userId: string,
    provedor: Provedor,
    idExistente: string,
    nova: { idExterno: string; nomeExibicao: string },
  ): Promise<ResultadoDoRetorno> {
    if (idExistente !== nova.idExterno) {
      return this.recusar(provedor, 'ja-vinculada');
    }
    await this.corrigirNome(userId, provedor, '', nova.nomeExibicao);
    return { resultado: 'vinculada' };
  }

  /** O nome da Steam muda: guarda o atual. Falha aqui não derruba a resposta (o nome é só rótulo). */
  private async corrigirNome(
    userId: string,
    provedor: Provedor,
    atual: string,
    novo: string,
  ): Promise<void> {
    if (novo === '' || novo === atual) {
      return;
    }
    try {
      await this.prisma.contaVinculada.update({
        where: { userId_provedor: { userId, provedor } },
        data: { nomeExibicao: novo },
        select: { id: true },
      });
    } catch {
      // Só rótulo: a próxima leitura do perfil tenta de novo.
    }
  }

  private maisJogados(itens: ItemDaBiblioteca[]): PerfilPlataforma['maisJogados'] {
    return itens
      .filter((item) => item.minutosJogados > 0)
      .sort(
        (a, b) => b.minutosJogados - a.minutosJogados || a.titulo.localeCompare(b.titulo, 'pt-BR'),
      )
      .slice(0, MAIS_JOGADOS_NO_CARTAO)
      .map((item) => ({
        idExterno: item.idExterno,
        titulo: item.titulo,
        capaUrl: item.capaUrl,
        minutosJogados: item.minutosJogados,
      }));
  }

  /** Só dado já gravado (nenhuma chamada à plataforma). `null` numa contagem é "nunca consultado": não soma. */
  private async conquistasDosJogosVinculados(
    userId: string,
    provedor: Provedor,
  ): Promise<PerfilPlataforma['conquistas']> {
    const jogos = await this.prisma.jogoPlataforma.findMany({
      where: { userId, provedor },
      select: { conquistasTotal: true, conquistasDesbloqueadas: true },
    });
    return {
      desbloqueadas: jogos.reduce((soma, jogo) => soma + (jogo.conquistasDesbloqueadas ?? 0), 0),
      total: jogos.reduce((soma, jogo) => soma + (jogo.conquistasTotal ?? 0), 0),
      jogosVinculados: jogos.length,
    };
  }

  private recusar(provedor: Provedor, motivo: MotivoDoRetorno): ResultadoDoRetorno {
    // Só o provedor e o motivo: nunca o SteamID, o `state`, o cookie nem a URL.
    this.logger.warn(`Vínculo (${provedor}) recusado: ${motivo}`);
    return { resultado: 'erro', motivo };
  }

  /** O endereço-BASE do retorno, no domínio que o navegador alcança (em produção, o da Vercel). */
  private returnToBase(provedor: Provedor): string {
    return `${this.apiPublicUrl()}/${API_GLOBAL_PREFIX}/integracoes/${PROVEDOR_SLUG[provedor]}/retorno`;
  }

  private apiPublicUrl(): string {
    return this.config.get('API_PUBLIC_URL', { infer: true });
  }

  private webPublicUrl(): string {
    return this.config.get('WEB_PUBLIC_URL', { infer: true });
  }
}
