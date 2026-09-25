import { Injectable } from '@nestjs/common';
import { type AvisoPlataforma, type Conquista } from '@checkpoint/shared';
import {
  type DadosDoJogo,
  type GameProvider,
  type ItemDaBiblioteca,
  type PerfilBasico,
} from '../providers/game-provider';
import {
  PerfilPrivadoError,
  PlataformaError,
  PlataformaIndisponivelError,
} from '../providers/plataforma-errors';
import { OpenIdInvalidoError, SteamOpenId } from './steam-open-id';
import { STEAM_VISIBILIDADE_PUBLICA, SteamClient } from './steam.client';
import { avatarUrlSeguro, capaOficialUrl, perfilUrlSeguro } from './steam-urls';

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
      },
    };
  }

  /** Horas e conquistas de um jogo chegam na etapa 4 da spec. Sem rota que chegue aqui até lá. */
  obterJogo(
    _idExterno: string,
    _idJogo: string,
  ): Promise<{ dados: DadosDoJogo; conquistas: Conquista[]; aviso: AvisoPlataforma | null }> {
    return Promise.reject(
      new Error('SteamProvider.obterJogo ainda não foi implementado (etapa 4)'),
    );
  }

  private returnToCompleto(base: string, state: string): string {
    return `${base}?state=${encodeURIComponent(state)}`;
  }

  private nomeDeExibicao(nome: string | null): string {
    const aparado = (nome ?? '').trim();
    return aparado === '' ? NOME_PADRAO_DA_CONTA : aparado.slice(0, NOME_MAX);
  }
}
