import { type AvisoPlataforma, type Conquista, type Provedor } from '@checkpoint/shared';

/** Quem é o usuário na plataforma, sem os dados de jogo. */
export interface PerfilBasico {
  nomeExibicao: string;
  avatarUrl: string | null;
  perfilUrl: string | null;
  /** `false` quando o perfil é privado: a biblioteca e as conquistas não vêm. */
  publico: boolean;
}

/** Um item da biblioteca do usuário, do jeito neutro da plataforma. */
export interface ItemDaBiblioteca {
  idExterno: string;
  titulo: string;
  capaUrl: string | null;
  minutosJogados: number;
  ultimaVezJogadoEm: Date | null;
}

/** O último valor consultado de um jogo (é o que vira `JogoPlataforma` no banco). */
export interface DadosDoJogo {
  idExterno: string;
  minutosJogados: number;
  ultimaVezJogadoEm: Date | null;
  /** `null` = negado ou não consultado; `0` = o jogo não tem conquistas. */
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
  capaUrl: string | null;
}

/** Como buscar o detalhe de um jogo (etapa 4): as horas só se o dado gravado já envelheceu, e o cache só se não for "Atualizar". */
export interface OpcoesDoDetalhe {
  /** `false` quando o dado gravado ainda é recente: não consulta as horas (a biblioteca), só as conquistas. */
  comHoras: boolean;
  /** O "Atualizar" manual: ignora o cache das conquistas do jogador. */
  ignorarCache: boolean;
}

/** O detalhe de UM jogo: as horas (se pedidas), as contagens e a lista completa de conquistas. */
export interface DetalheDoJogo {
  horas: { minutosJogados: number; ultimaVezJogadoEm: Date | null; capaUrl: string | null } | null;
  /** `null` = conquistas negadas; `0` = o jogo não tem conquistas. */
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
  conquistas: Conquista[];
  aviso: AvisoPlataforma | null;
}

/**
 * O que a API espera de uma plataforma de jogos (spec `integracao-plataformas`, decisão 10). A Steam é a
 * primeira implementação; PlayStation, Xbox e Epic entram implementando esta interface e acrescentando um
 * valor a `Provedor`, sem mexer no `IntegrationsService`.
 *
 * Os métodos lançam os erros de `plataforma-errors.ts`: `PerfilPrivadoError`, `PlataformaIndisponivelError`,
 * `PlataformaLimiteError` e `IdExternoInvalidoError`.
 */
export interface GameProvider {
  readonly id: Provedor;

  /**
   * Monta o endereço para onde o navegador vai provar quem é o usuário na plataforma. `returnTo` é o
   * endereço-BASE da rota de retorno (sem query): o provider põe o `state` nele, e o `concluirVinculo` o
   * refaz da mesma forma para conferir que a plataforma devolveu exatamente o que foi pedido.
   */
  iniciarVinculo(ctx: { state: string; returnTo: string; realm: string }): { url: string };

  /**
   * Confere o retorno do navegador (`query` traz o `state` e os parâmetros da plataforma) e devolve o ID (já
   * comprovado) e o nome do usuário. `returnTo` é o mesmo endereço-base do `iniciarVinculo`.
   */
  concluirVinculo(
    query: Record<string, string>,
    ctx: { returnTo: string },
  ): Promise<{ idExterno: string; nomeExibicao: string }>;

  /**
   * A biblioteca e o perfil, na mesma consulta (o cartão do `/perfil` precisa dos dois, e a detecção de
   * privacidade cruza as duas chamadas). Lança `PerfilPrivadoError` se os dados não são públicos.
   */
  listarBiblioteca(idExterno: string): Promise<{ itens: ItemDaBiblioteca[]; perfil: PerfilBasico }>;

  /**
   * O resumo de UM jogo: horas, última vez jogado, capa e as contagens de conquistas (etapa 3); a lista
   * completa de conquistas chega na etapa 4. Lança `PerfilPrivadoError` (biblioteca privada),
   * `PlataformaItemNaoEncontradoError` (o item não é do usuário) e os erros de indisponibilidade.
   */
  obterJogo(
    idExterno: string,
    idJogo: string,
  ): Promise<{ dados: DadosDoJogo; conquistas: Conquista[]; aviso: AvisoPlataforma | null }>;

  /**
   * O detalhe completo (etapa 4): a lista de conquistas com nome, descrição, ícone, data e raridade. Falha só do
   * schema ou dos percentuais NÃO derruba (nome vira o id e a raridade `null`). Conquistas negadas dão o aviso
   * `CONQUISTAS_PRIVADAS` (horas e vínculo ficam). Os outros erros da plataforma sobem: quem chama decide (o `GET`
   * devolve o valor gravado, nunca 502).
   */
  obterDetalhe(idExterno: string, idJogo: string, opcoes: OpcoesDoDetalhe): Promise<DetalheDoJogo>;
}
