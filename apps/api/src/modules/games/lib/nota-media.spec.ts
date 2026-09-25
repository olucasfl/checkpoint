import { GAME_RATING_CRITERIA, isValidRating, notaMedia } from '@checkpoint/shared';

/**
 * `notaMedia` e `isValidRating` vivem em `packages/shared`, que não tem runner de teste (a spec
 * avaliacao-de-jogos registra isso): elas são testadas aqui, pelo lado que as usa, e no web.
 */
describe('notaMedia', () => {
  it('sem nenhum critério é null (CA-02)', () => {
    expect(notaMedia({})).toBeNull();
    expect(
      notaMedia({
        gameplay: null,
        historia: null,
        graficos: undefined,
        trilhaSonora: null,
        performance: null,
      }),
    ).toBeNull();
  });

  it('média parcial: critério em branco não entra', () => {
    expect(notaMedia({ gameplay: 9, historia: null, graficos: 7 })).toBe(8);
  });

  it('0 é nota e entra na média (CA-03)', () => {
    expect(notaMedia({ gameplay: 0 })).toBe(0);
    expect(notaMedia({ gameplay: 10, historia: 0 })).toBe(5);
  });

  it('arredonda para cima na metade, com 1 casa: 8,75 -> 8,8 (CA-01)', () => {
    expect(notaMedia({ gameplay: 9, historia: 8.5 })).toBe(8.8);
  });

  it('a média dos cinco critérios: 35,4 / 5 = 7,08 -> 7,1 (CA-09)', () => {
    expect(
      notaMedia({ gameplay: 10, historia: 9.9, graficos: 8, trilhaSonora: 7.5, performance: 0 }),
    ).toBe(7.1);
  });

  it('só os quatro restantes: 25,4 / 4 = 6,35 -> 6,4 (CA-10)', () => {
    expect(notaMedia({ historia: 9.9, graficos: 8, trilhaSonora: 7.5, performance: 0 })).toBe(6.4);
  });

  it('não acumula erro de ponto flutuante: 7,3 + 8,5 = 7,9, e não 7,9000000000000004', () => {
    expect(notaMedia({ gameplay: 7.3, historia: 8.5 })).toBe(7.9);
    expect(notaMedia({ gameplay: 0.1, historia: 0.2 })).toBe(0.2);
  });

  it('o resultado tem no máximo 1 casa decimal, em qualquer combinação', () => {
    const valores = [0, 0.1, 3.3, 5, 7.3, 9.9, 10];
    for (const a of valores) {
      for (const b of valores) {
        for (const c of valores) {
          const media = notaMedia({ gameplay: a, historia: b, graficos: c });
          expect(media).not.toBeNull();
          expect(isValidRating(media)).toBe(true);
        }
      }
    }
  });
});

describe('isValidRating', () => {
  it.each([0, 10, 5, 7.3, 0.1, 9.9, 8.7, 0.3, 4.6])('aceita %s', (valor) => {
    expect(isValidRating(valor)).toBe(true);
  });

  it.each([
    ['fora da faixa: 10,1', 10.1],
    ['negativo', -0.1],
    ['2 casas: 7,55', 7.55],
    ['2 casas: 0,01', 0.01],
    ['texto "7"', '7'],
    ['texto "7,3"', '7,3'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['undefined', undefined],
    ['booleano', true],
  ])('rejeita %s', (_nome, valor) => {
    expect(isValidRating(valor)).toBe(false);
  });
});

describe('GAME_RATING_CRITERIA', () => {
  it('tem as cinco chaves da spec, na ordem de tela, cada uma com rótulo e descrição', () => {
    expect(GAME_RATING_CRITERIA.map((c) => c.chave)).toEqual([
      'gameplay',
      'historia',
      'graficos',
      'trilhaSonora',
      'performance',
    ]);
    expect(GAME_RATING_CRITERIA.map((c) => c.rotulo)).toEqual([
      'Gameplay',
      'História',
      'Gráficos',
      'Trilha sonora',
      'Performance técnica',
    ]);
    for (const criterio of GAME_RATING_CRITERIA) {
      expect(criterio.descricao.length).toBeGreaterThan(10);
    }
  });
});
