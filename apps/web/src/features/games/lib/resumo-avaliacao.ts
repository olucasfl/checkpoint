import { GAME_RATING_CRITERIA, type Game } from '@checkpoint/shared';
import { formatRating } from './rating-input';

/** A linha da seção "Avaliação e descrição" fechada: "Média 8,3 · 4 de 5 critérios", ou "Sem nota". */
export function resumoDaAvaliacao(game: Pick<Game, 'notaMedia' | 'notas'>): string {
  if (game.notaMedia === null) {
    return 'Sem nota';
  }
  const preenchidos = GAME_RATING_CRITERIA.filter((c) => game.notas[c.chave] !== null).length;
  return `Média ${formatRating(game.notaMedia)} · ${preenchidos} de ${GAME_RATING_CRITERIA.length} critérios`;
}
