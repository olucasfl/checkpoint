import { type Game, type GameStatus } from '@checkpoint/shared';
import { horasEMinutos } from '@/features/integracoes/lib/conquistas';
import { formatRating } from './rating-input';
import { type StatusFilter } from './status-filter';

/** As prateleiras da estante, na ordem da tela (spec `troca-de-design-estante`): título e ícone de cada status. */
export const PRATELEIRAS: readonly { status: GameStatus; titulo: string; icone: string }[] = [
  { status: 'JOGANDO', titulo: 'Jogando agora', icone: 'sports_esports' },
  { status: 'QUERO_JOGAR', titulo: 'Quero jogar', icone: 'bookmark' },
  { status: 'ZERADO', titulo: 'Zerados', icone: 'emoji_events' },
];

export interface PrateleiraDoCatalogo {
  status: GameStatus;
  titulo: string;
  icone: string;
  jogos: Game[];
}

/**
 * Agrupa a lista COMPLETA nas prateleiras, preservando a ordem que a API mandou (`atualizadoEm` decrescente). Com
 * "Todos", só aparece a prateleira com pelo menos um jogo; com um filtro de status, só a dele (e só se tiver jogos:
 * sem jogos, quem fala é o estado "Nenhum jogo neste status").
 */
export function agruparEmPrateleiras(
  games: readonly Game[],
  filtro: StatusFilter,
): PrateleiraDoCatalogo[] {
  return PRATELEIRAS.filter((prateleira) => filtro === 'TODOS' || prateleira.status === filtro)
    .map((prateleira) => ({
      ...prateleira,
      jogos: games.filter((game) => game.status === prateleira.status),
    }))
    .filter((prateleira) => prateleira.jogos.length > 0);
}

/**
 * O destaque "Continue de onde parou": o primeiro jogo Jogando da lista (que já vem por `atualizadoEm` decrescente),
 * ou `null`. **Só com o filtro "Todos" ou "Jogando"**, mesmo havendo jogos Jogando nos outros. Toda edição de um
 * jogo (até a da descrição) atualiza o `atualizadoEm` e o promove (decisão do humano, spec, questão 14).
 */
export function destaqueDoCatalogo(games: readonly Game[], filtro: StatusFilter): Game | null {
  if (filtro !== 'TODOS' && filtro !== 'JOGANDO') {
    return null;
  }
  return games.find((game) => game.status === 'JOGANDO') ?? null;
}

/**
 * A plataforma como aparece NA TELA: a barra vertical de "Xbox Series X|S" parecia um "I" na Manrope ("XIS"), então
 * vira "/". O valor gravado (e enviado à API) continua `X|S`: isto só formata o que se lê.
 */
export function nomeDaPlataforma(plataforma: string): string {
  return plataforma.replace(/\|/g, '/');
}

export interface ChipsDoDestaque {
  plataforma: string | null;
  media: string | null;
  horas: string | null;
  conquistas: string | null;
}

/**
 * Os chips do destaque: plataforma (se houver), média (se houver; 0 é nota) e, **só nos jogos ligados à Steam**, as
 * horas ("42 h 30 min na Steam") e as conquistas ("12/40 conquistas", só com total > 0).
 */
export function chipsDoDestaque(game: Game): ChipsDoDestaque {
  const plataforma = game.plataforma?.trim() ? nomeDaPlataforma(game.plataforma.trim()) : null;
  const media = game.notaMedia === null ? null : formatRating(game.notaMedia);
  const steam = game.dadosPlataforma[0];
  const horas = steam ? `${horasEMinutos(steam.minutosJogados)} na Steam` : null;
  const conquistas =
    steam &&
    steam.conquistasTotal !== null &&
    steam.conquistasTotal > 0 &&
    steam.conquistasDesbloqueadas !== null
      ? `${steam.conquistasDesbloqueadas}/${steam.conquistasTotal} conquistas`
      : null;
  return { plataforma, media, horas, conquistas };
}
