import { AxiosError } from 'axios';
import { chaveDeTitulo } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  PLATAFORMA_PADRAO,
  TITULO_MAX,
  jogoAtualDoErro,
  precisaConfirmarPlataforma,
  statusSugerido,
  tituloDoItem,
} from './biblioteca';

function erroHttp(status: number, data: unknown): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

describe('statusSugerido (nunca Zerado)', () => {
  it.each([
    [0, 'QUERO_JOGAR'],
    [1, 'JOGANDO'],
    [90, 'JOGANDO'],
    [1_000_000, 'JOGANDO'],
  ] as const)('%i min → %s', (minutos, esperado) => {
    expect(statusSugerido(minutos)).toBe(esperado);
  });
});

describe('precisaConfirmarPlataforma', () => {
  it.each([null, undefined, '', '   ', 'PC', 'pc', ' PC '])('%j não pede confirmação', (valor) => {
    expect(precisaConfirmarPlataforma(valor)).toBe(false);
  });

  it.each(['PS5', 'Nintendo Switch', 'Steam Deck', 'PlayStation'])(
    '%s pede confirmação',
    (valor) => {
      expect(precisaConfirmarPlataforma(valor)).toBe(true);
    },
  );

  it('a plataforma padrão do jogo novo é PC', () => {
    expect(PLATAFORMA_PADRAO).toBe('PC');
  });
});

describe('tituloDoItem', () => {
  it('aparo e limita a 120 caracteres', () => {
    expect(tituloDoItem('  Celeste ')).toBe('Celeste');
    expect(tituloDoItem('a'.repeat(300))).toHaveLength(TITULO_MAX);
  });
});

describe('jogoAtualDoErro', () => {
  it('lê o jogo do 409 PLATAFORMA_ITEM_JA_VINCULADO', () => {
    const erro = erroHttp(409, {
      statusCode: 409,
      code: 'PLATAFORMA_ITEM_JA_VINCULADO',
      message: 'x',
      jogoAtual: { id: 'g1', titulo: 'Celeste' },
    });
    expect(jogoAtualDoErro(erro)).toEqual({ id: 'g1', titulo: 'Celeste' });
  });

  it.each([
    [
      'outro código',
      erroHttp(409, { statusCode: 409, code: 'PLATAFORMA_JOGO_JA_VINCULADO', message: 'x' }),
    ],
    [
      'jogoAtual malformado',
      erroHttp(409, {
        statusCode: 409,
        code: 'PLATAFORMA_ITEM_JA_VINCULADO',
        message: 'x',
        jogoAtual: { id: 1 },
      }),
    ],
    [
      'sem jogoAtual',
      erroHttp(409, { statusCode: 409, code: 'PLATAFORMA_ITEM_JA_VINCULADO', message: 'x' }),
    ],
    ['erro que não é do axios', new Error('x')],
  ])('%s → null', (_nome, erro) => {
    expect(jogoAtualDoErro(erro)).toBeNull();
  });
});

describe('chaveDeTitulo (a mesma do servidor, usada nos parecidos)', () => {
  it('ignora caixa, acento, ™ e espaços repetidos; não aproxima', () => {
    expect(chaveDeTitulo('Pokémon™: Legends – Arceus')).toBe(
      chaveDeTitulo(' POKEMON  legends arceus '),
    );
    expect(chaveDeTitulo('Celeste')).not.toBe(chaveDeTitulo('Celeste 64'));
  });
});
