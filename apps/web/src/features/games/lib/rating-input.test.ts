import { isValidRating, notaMedia } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import { formatRating, parseRatingInput, ratingErrorText, ratingToInput } from './rating-input';

describe('parseRatingInput (CA-17, CA-18, CA-20)', () => {
  it('vazio ou só espaços é "sem nota", que NÃO é 0', () => {
    expect(parseRatingInput('')).toEqual({ kind: 'vazio' });
    expect(parseRatingInput('   ')).toEqual({ kind: 'vazio' });
  });

  it('0 é uma nota válida', () => {
    expect(parseRatingInput('0')).toEqual({ kind: 'ok', valor: 0 });
    expect(parseRatingInput('0,0')).toEqual({ kind: 'ok', valor: 0 });
  });

  it.each([
    ['8,7', 8.7],
    ['8.7', 8.7],
    ['10', 10],
    ['10,0', 10],
    ['7,30', 7.3],
    ['  9 ', 9],
    ['0,1', 0.1],
  ])('aceita %s como %s (vírgula ou ponto)', (texto, valor) => {
    expect(parseRatingInput(texto)).toEqual({ kind: 'ok', valor });
  });

  it.each([
    '10,1',
    '11',
    '7,55',
    '0,01',
    '-1',
    '-0,5',
    'abc',
    '1,2,3',
    '7,',
    ',5',
    '1e1',
    '8 7',
    '+8',
  ])('rejeita %s', (texto) => {
    expect(parseRatingInput(texto)).toEqual({ kind: 'invalido' });
  });

  it('nunca devolve um valor que a API rejeitaria', () => {
    for (const texto of ['0', '5', '7,3', '9.9', '10']) {
      const parsed = parseRatingInput(texto);
      expect(parsed.kind === 'ok' && isValidRating(parsed.valor)).toBe(true);
    }
  });
});

describe('formatação', () => {
  it('formatRating: sempre 1 casa e vírgula (a nota na tela)', () => {
    expect(formatRating(9)).toBe('9,0');
    expect(formatRating(8.7)).toBe('8,7');
    expect(formatRating(0)).toBe('0,0');
    expect(formatRating(10)).toBe('10,0');
    expect(formatRating(7.3)).toBe('7,3');
  });

  it('ratingToInput: como o número entra no campo, com vírgula e sem casa sobrando', () => {
    expect(ratingToInput(9)).toBe('9');
    expect(ratingToInput(8.7)).toBe('8,7');
    expect(ratingToInput(0)).toBe('0');
  });

  it('ida e volta: o texto do campo lê de volta o mesmo número', () => {
    for (const nota of [0, 0.1, 5, 7.3, 8.7, 9.9, 10]) {
      expect(parseRatingInput(ratingToInput(nota))).toEqual({ kind: 'ok', valor: nota });
    }
  });

  it('a mensagem de erro é a mesma da API', () => {
    expect(ratingErrorText('Gameplay')).toBe(
      'A nota de Gameplay deve ser um número de 0 a 10, com no máximo 1 casa decimal',
    );
  });
});

/**
 * `notaMedia` e `isValidRating` vivem em `packages/shared` (sem runner, ver spec avaliacao-de-jogos): o web,
 * que as usa na média ao vivo, também as testa.
 */
describe('notaMedia e isValidRating do shared, do lado do web', () => {
  it('média parcial e arredondamento para cima na metade (8,75 -> 8,8)', () => {
    expect(notaMedia({})).toBeNull();
    expect(notaMedia({ gameplay: 9, historia: 8.5 })).toBe(8.8);
    expect(notaMedia({ gameplay: 10, historia: 0 })).toBe(5);
    expect(notaMedia({ gameplay: 7.3, historia: 8.5 })).toBe(7.9);
  });

  it('isValidRating: 0 a 10 com no máximo 1 casa', () => {
    expect(isValidRating(7.3)).toBe(true);
    expect(isValidRating(7.55)).toBe(false);
    expect(isValidRating(10.1)).toBe(false);
    expect(isValidRating('7')).toBe(false);
  });
});
