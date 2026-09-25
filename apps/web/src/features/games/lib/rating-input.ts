import { GAME_RATING_MAX, GAME_RATING_MIN, isValidRating } from '@checkpoint/shared';

/**
 * O que a pessoa digitou num critério: nada ("sem nota", que NÃO é 0), um número válido ou texto
 * inválido. O campo aceita vírgula e ponto; o JSON leva sempre o número (`8.7`).
 */
export type RatingParse = { kind: 'vazio' } | { kind: 'ok'; valor: number } | { kind: 'invalido' };

const DECIMAL = /^\d+([.,]\d+)?$/;

export function parseRatingInput(texto: string): RatingParse {
  const limpo = texto.trim();
  if (limpo === '') {
    return { kind: 'vazio' };
  }
  if (!DECIMAL.test(limpo)) {
    return { kind: 'invalido' };
  }
  const valor = Number(limpo.replace(',', '.'));
  return isValidRating(valor) ? { kind: 'ok', valor } : { kind: 'invalido' };
}

/** A mesma mensagem da API para nota fora da faixa ou com casa demais (o web avisa antes de enviar). */
export function ratingErrorText(rotulo: string): string {
  return `A nota de ${rotulo} deve ser um número de ${GAME_RATING_MIN} a ${GAME_RATING_MAX}, com no máximo 1 casa decimal`;
}

/** Como o número entra no campo de texto: vírgula, sem casa sobrando (9, 8,7, 0). */
export function ratingToInput(nota: number): string {
  return String(nota).replace('.', ',');
}

/** Como a nota aparece na tela: sempre 1 casa e vírgula (9,0; 8,7; 0,0). */
export function formatRating(nota: number): string {
  return nota.toFixed(1).replace('.', ',');
}
