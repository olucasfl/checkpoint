import type { ApiErrorResponse } from './games';
import type { Provedor } from './plataformas';

/**
 * Contrato das integrações com plataformas de jogos (spec `integracao-plataformas`). Só tipos,
 * constantes e funções puras: nada de Node, `window` nem Prisma. A primeira plataforma é a Steam; as
 * outras entram acrescentando um valor a `PROVEDORES` e implementando `GameProvider` na API.
 */

/**
 * Idade a partir da qual abrir o detalhe de um jogo refaz a consulta à plataforma. Constante nomeada
 * para ser fácil de mudar (spec, Q5); a API e o web leem a mesma.
 */
export const ATUALIZACAO_AUTOMATICA_MS = 60 * 60 * 1000;

/** Intervalo mínimo entre dois "Atualizar" manuais do mesmo jogo ou do mesmo perfil. */
export const ATUALIZACAO_MANUAL_MIN_MS = 30 * 1000;

export interface ContaVinculada {
  provedor: Provedor;
  idExterno: string;
  nomeExibicao: string;
  vinculadaEm: string; // ISO 8601
}

/** Resposta de `POST /api/integracoes/:provedor/vinculo`: para onde o navegador deve ir. */
export interface IniciarVinculoResponse {
  url: string;
}

/** Um jogo do catálogo do usuário, como aparece nas sugestões de vínculo. */
export interface JogoParecido {
  id: string;
  titulo: string;
  plataforma: string | null;
}

/** Um item da biblioteca do usuário na plataforma. */
export interface ItemBiblioteca {
  idExterno: string;
  titulo: string;
  capaUrl: string | null;
  minutosJogados: number;
  ultimaVezJogadoEm: string | null; // ISO 8601
  /** Jogos do catálogo com o mesmo título normalizado e ainda sem vínculo com o provedor (até 3). */
  jogosParecidos: JogoParecido[];
  /** O jogo ao qual este item já está ligado, ou `null`. */
  vinculadoA: JogoParecido | null;
}

/** O que o cartão do `/perfil` mostra. `conquistas` soma só os jogos vinculados (dado já gravado). */
export interface PerfilPlataforma {
  provedor: Provedor;
  nomeExibicao: string;
  avatarUrl: string | null;
  perfilUrl: string | null;
  totalJogos: number;
  minutosTotais: number;
  maisJogados: {
    idExterno: string;
    titulo: string;
    capaUrl: string | null;
    minutosJogados: number;
  }[];
  conquistas: { desbloqueadas: number; total: number; jogosVinculados: number };
  consultadoEm: string; // ISO 8601
}

/** Como a pessoa aparece na plataforma agora. `jogando` = em jogo (a plataforma diz qual). */
export type StatusNaPlataforma = 'online' | 'offline' | 'jogando';

/**
 * O que o popup da plataforma mostra (spec `plataformas-e-pagina-do-jogo`, F4a). Tudo sai da biblioteca e do perfil
 * que o cartão já consultava (mesmo cache) e do que está gravado no banco: nenhuma chamada nova à plataforma.
 * `membroDesde` e `status` só vêm com o perfil público (`null` quando a plataforma não os devolve).
 */
export interface ResumoContaPlataforma {
  provedor: Provedor;
  nomeExibicao: string;
  avatarUrl: string | null;
  perfilUrl: string | null;
  /** O ano em que a conta foi criada. */
  membroDesde: number | null;
  status: StatusNaPlataforma | null;
  /** O nome do jogo em andamento; só com `status: 'jogando'`. */
  jogandoAgora: string | null;
  totalJogos: number;
  minutosTotais: number;
  /** Jogos com mais de 0 minutos. */
  jogosJogados: number;
  /** O backlog: jogos com 0 minutos (`totalJogos - jogosJogados`). */
  nuncaJogados: number;
  /** Até 5, do mais jogado para o menos. */
  maisJogados: {
    idExterno: string;
    titulo: string;
    capaUrl: string | null;
    minutosJogados: number;
  }[];
  /** `ligados` dos `naBiblioteca` jogos da biblioteca já estão ligados a um jogo do catálogo. */
  noCheckpoint: { ligados: number; naBiblioteca: number };
  conquistas: { desbloqueadas: number; total: number; jogosVinculados: number };
  consultadoEm: string; // ISO 8601
}

/** A camada da plataforma sobre um jogo do catálogo (o último valor gravado). */
export interface DadosJogoPlataforma {
  provedor: Provedor;
  idExterno: string;
  minutosJogados: number;
  ultimaVezJogadoEm: string | null; // ISO 8601
  /** `null` = nunca consultado ou negado; `0` = o jogo não tem conquistas. */
  conquistasTotal: number | null;
  conquistasDesbloqueadas: number | null;
  capaUrl: string | null;
  atualizadoEm: string; // ISO 8601
}

export interface Conquista {
  id: string;
  nome: string;
  descricao: string | null;
  oculta: boolean;
  desbloqueada: boolean;
  desbloqueadaEm: string | null; // ISO 8601
  iconeUrl: string | null;
  /** % dos jogadores que a têm, com 1 casa decimal; `null` quando indisponível. */
  raridadePercentual: number | null;
}

export type AvisoPlataforma =
  'PERFIL_PRIVADO' | 'CONQUISTAS_PRIVADAS' | 'SEM_CONQUISTAS' | 'INDISPONIVEL';

export interface DetalheJogoPlataforma {
  dados: DadosJogoPlataforma;
  conquistas: Conquista[];
  aviso: AvisoPlataforma | null;
}

/** Corpo de `PUT /api/integracoes/:provedor/jogos/:jogoId`. */
export interface VincularJogoRequest {
  idExterno: string;
  /** Com `true`, tira o vínculo do outro jogo que já o tem e o move para este. */
  mover?: boolean;
}

/** 409 `PLATAFORMA_ITEM_JA_VINCULADO`: o corpo traz o jogo que já tem o item. */
export interface PlataformaItemJaVinculadoError extends ApiErrorResponse {
  jogoAtual: { id: string; titulo: string };
}

/**
 * Chave para comparar títulos "sem caixa nem acento": tira diacríticos, ™ ® ©, pontuação e espaços
 * repetidos. `Pokémon™: Legends – Arceus` e ` POKEMON  legends arceus ` dão a mesma chave. É igualdade
 * exata da chave, sem aproximação: "Celeste" e "Celeste 64" continuam diferentes.
 */
export function chaveDeTitulo(titulo: string): string {
  return (
    titulo
      .normalize('NFD')
      // Só os acentos combinados do latim (U+0300–U+036F): tirar toda marca `\p{M}` apagaria o dakuten
      // do japonês e igualaria "ペ" a "ヘ". O NFC devolve as demais letras à forma composta.
      .replace(/[̀-ͯ]+/g, '')
      .normalize('NFC')
      .replace(/[™®©]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
      .trim()
  );
}
