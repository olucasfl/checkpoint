import { describe, expect, it } from 'vitest';
import { resumoDaAvaliacao } from './resumo-avaliacao';

const notas = (n: (number | null)[]) => ({
  gameplay: n[0] ?? null,
  historia: n[1] ?? null,
  graficos: n[2] ?? null,
  trilhaSonora: n[3] ?? null,
  performance: n[4] ?? null,
});

describe('resumoDaAvaliacao', () => {
  it('sem média: "Sem nota"', () => {
    expect(resumoDaAvaliacao({ notaMedia: null, notas: notas([]) })).toBe('Sem nota');
  });
  it('com média: vírgula, 1 casa e quantos critérios foram preenchidos (o 0 conta)', () => {
    expect(resumoDaAvaliacao({ notaMedia: 8.3, notas: notas([9, 8, 8.5, 9.5, 6.5]) })).toBe(
      'Média 8,3 · 5 de 5 critérios',
    );
    expect(resumoDaAvaliacao({ notaMedia: 0, notas: notas([0, null, null, null, null]) })).toBe(
      'Média 0,0 · 1 de 5 critérios',
    );
  });
});
