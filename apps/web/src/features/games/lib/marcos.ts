import { type DadosJogoPlataforma, type Game, type GameStatus } from '@checkpoint/shared';
import { STATUS_META } from './status-meta';
import { type StatusFilter } from './status-filter';

/** Os marcos com o Chek comemorando. Cada um vale por ocorrência e nada é gravado (spec, "Suposições" 9). */
export type Marco = 'primeiro-jogo' | 'zerado' | 'conquistas-100';

interface EntradaDoSalvar {
  /** O salvar CRIOU o jogo (o formulário abriu sem jogo). */
  criado: boolean;
  /** A lista de jogos estava vazia quando o formulário abriu. */
  listaVazia: boolean;
  /** O jogo antes da edição (ausente ao criar). */
  anterior?: Pick<Game, 'status'>;
  /** O jogo como ficou. */
  jogo: Pick<Game, 'status'>;
}

/**
 * Qual marco um salvar merece, se algum: o primeiro jogo (criar com a lista vazia) ou um jogo que PASSA a Zerado (criado
 * já Zerado ou trocado para Zerado). Só um por salvar: o primeiro jogo tem precedência. Abrir a lista com jogos Zerados
 * nunca comemora nada.
 */
export function marcoDoSalvar({
  criado,
  listaVazia,
  anterior,
  jogo,
}: EntradaDoSalvar): Extract<Marco, 'primeiro-jogo' | 'zerado'> | null {
  if (criado && listaVazia) {
    return 'primeiro-jogo';
  }
  if (jogo.status === 'ZERADO' && (criado || anterior?.status !== 'ZERADO')) {
    return 'zerado';
  }
  return null;
}

type Conquistas = Pick<DadosJogoPlataforma, 'conquistasTotal' | 'conquistasDesbloqueadas'>;

const completo = ({ conquistasTotal, conquistasDesbloqueadas }: Conquistas): boolean =>
  conquistasTotal !== null && conquistasTotal > 0 && conquistasDesbloqueadas === conquistasTotal;

/** As conquistas passaram a 100% (estavam incompletas antes e estão completas agora). Abrir um jogo já em 100% não conta. */
export function chegouAos100(antes: Conquistas, depois: Conquistas): boolean {
  return !completo(antes) && completo(depois);
}

export function textoDoMarco(marco: Marco, titulo: string): string {
  switch (marco) {
    case 'primeiro-jogo':
      return 'Seu primeiro jogo no catálogo! Bem-vindo ao Checkpoint.';
    case 'zerado':
      return `Zerado! «${titulo}» entrou para os Zerados.`;
    case 'conquistas-100':
      return `100% das conquistas em «${titulo}»!`;
  }
}

/** O novo jogo aparece na tela com o filtro atual? (Com "Todos" ou com o filtro do próprio status, sim.) */
export function apareceNoFiltro(filtro: StatusFilter, status: GameStatus): boolean {
  return filtro === 'TODOS' || filtro === status;
}

export function rotuloDoStatus(status: GameStatus): string {
  return STATUS_META[status].label;
}
