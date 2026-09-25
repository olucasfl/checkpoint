import { type Game as GameRow } from '@prisma/client';
import { GAME_RATING_KEYS, type GameRatingKey, type GameRatings } from '@checkpoint/shared';

/**
 * As notas ficam no banco em DECIMOS inteiros (0 a 100; 73 = 7,3), para não haver `Decimal` nem ponto
 * flutuante no Prisma. Este arquivo é a única fronteira da conversão: dentro do service tudo é décimo, e a
 * API expõe sempre 0 a 10.
 */
export const RATING_COLUMNS = {
  gameplay: 'notaGameplay',
  historia: 'notaHistoria',
  graficos: 'notaGraficos',
  trilhaSonora: 'notaTrilhaSonora',
  performance: 'notaPerformance',
} as const satisfies Record<GameRatingKey, keyof GameRow>;

export type RatingColumn = (typeof RATING_COLUMNS)[GameRatingKey];

/** Uma nota por critério, em décimos; `null` = sem nota. */
export type Tenths = Record<GameRatingKey, number | null>;

export function toTenths(nota: number | null | undefined): number | null {
  return typeof nota === 'number' ? Math.round(nota * 10) : null;
}

export function fromTenths(decimos: number | null): number | null {
  return decimos === null ? null : decimos / 10;
}

export function tenthsOfRow(row: GameRow): Tenths {
  const tenths = {} as Tenths;
  for (const key of GAME_RATING_KEYS) {
    tenths[key] = row[RATING_COLUMNS[key]];
  }
  return tenths;
}

/** As notas como a API as devolve (0 a 10). */
export function ratingsOfRow(row: GameRow): GameRatings {
  const notas = {} as GameRatings;
  for (const key of GAME_RATING_KEYS) {
    notas[key] = fromTenths(row[RATING_COLUMNS[key]]);
  }
  return notas;
}

/** As colunas do Prisma a gravar, a partir das notas em décimos. */
export function columnsOfTenths(tenths: Tenths): Record<RatingColumn, number | null> {
  const columns = {} as Record<RatingColumn, number | null>;
  for (const key of GAME_RATING_KEYS) {
    columns[RATING_COLUMNS[key]] = tenths[key];
  }
  return columns;
}
