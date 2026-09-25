import { type Game as GameRow } from '@prisma/client';
import { columnsOfTenths, fromTenths, ratingsOfRow, tenthsOfRow, toTenths } from './ratings';

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: 'g1',
    userId: 'u1',
    titulo: 'Celeste',
    plataforma: '',
    status: 'ZERADO',
    notaGameplay: null,
    notaHistoria: null,
    notaGraficos: null,
    notaTrilhaSonora: null,
    notaPerformance: null,
    descricao: null,
    capaPath: null,
    tituloNormalizado: 'celeste',
    plataformaNormalizada: '',
    criadoEm: new Date('2026-09-25T12:00:00.000Z'),
    atualizadoEm: new Date('2026-09-25T12:00:00.000Z'),
    ...overrides,
  };
}

describe('conversão décimos <-> 0 a 10', () => {
  it.each([
    [0, 0],
    [7.3, 73],
    [8.5, 85],
    [10, 100],
    [0.1, 1],
    [4.6, 46],
    [1.1, 11],
  ])('%s vira %s décimos (sem erro de ponto flutuante)', (nota, decimos) => {
    expect(toTenths(nota)).toBe(decimos);
    expect(fromTenths(decimos)).toBe(nota);
  });

  it('null e ausente ficam null (sem nota), e 0 continua 0', () => {
    expect(toTenths(null)).toBeNull();
    expect(toTenths(undefined)).toBeNull();
    expect(fromTenths(null)).toBeNull();
    expect(toTenths(0)).toBe(0);
  });

  it('a linha do banco vira as notas 0 a 10 da API', () => {
    const notas = ratingsOfRow(row({ notaGameplay: 92, notaHistoria: 80, notaPerformance: 0 }));

    expect(notas).toEqual({
      gameplay: 9.2,
      historia: 8,
      graficos: null,
      trilhaSonora: null,
      performance: 0,
    });
  });

  it('ida e volta: as colunas gravadas leem de volta o mesmo', () => {
    const decimos = {
      gameplay: 73,
      historia: null,
      graficos: 0,
      trilhaSonora: 100,
      performance: 1,
    };
    const colunas = columnsOfTenths(decimos);

    expect(colunas).toEqual({
      notaGameplay: 73,
      notaHistoria: null,
      notaGraficos: 0,
      notaTrilhaSonora: 100,
      notaPerformance: 1,
    });
    expect(tenthsOfRow(row(colunas))).toEqual(decimos);
  });
});
