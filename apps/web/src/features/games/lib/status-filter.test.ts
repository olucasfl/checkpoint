import { describe, expect, it } from 'vitest';
import { FILTER_ORDER, parseStatusFilter, statusFilterToParams } from './status-filter';

describe('parseStatusFilter (CA-45, CA-47)', () => {
  it.each(['ZERADO', 'JOGANDO', 'QUERO_JOGAR'])('aceita %s', (status) => {
    expect(parseStatusFilter(status)).toBe(status);
  });

  it('sem parâmetro é TODOS', () => {
    expect(parseStatusFilter(null)).toBe('TODOS');
  });

  it.each(['PAUSADO', '', 'jogando', 'TODOS', 'ZERADO,JOGANDO'])(
    'valor inválido %j vira TODOS (não chega a lugar nenhum)',
    (value) => {
      expect(parseStatusFilter(value)).toBe('TODOS');
    },
  );
});

describe('statusFilterToParams', () => {
  it('TODOS não leva parâmetro; um status vira ?status=', () => {
    expect(statusFilterToParams('TODOS')).toEqual({});
    expect(statusFilterToParams('JOGANDO')).toEqual({ status: 'JOGANDO' });
  });
});

describe('FILTER_ORDER', () => {
  it('é Todos, Jogando, Quero jogar, Zerado (spec)', () => {
    expect(FILTER_ORDER).toEqual(['TODOS', 'JOGANDO', 'QUERO_JOGAR', 'ZERADO']);
  });
});
