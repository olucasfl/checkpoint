import { AxiosError } from 'axios';
import { PLATAFORMAS, chaveDeTitulo } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  TITULO_MAX,
  jogoAtualDoErro,
  plataformaDoNovoJogo,
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

describe('precisaConfirmarPlataforma (pelo cadastro)', () => {
  it.each([null, undefined, '', '   ', 'PC', 'pc', ' PC ', 'Steam Deck'])(
    'Steam: %j não pede confirmação',
    (valor) => {
      expect(precisaConfirmarPlataforma(valor, PLATAFORMAS.STEAM)).toBe(false);
    },
  );

  it.each(['PS5', 'Nintendo Switch', 'PlayStation', 'Xbox One'])(
    'Steam: %s pede confirmação',
    (valor) => {
      expect(precisaConfirmarPlataforma(valor, PLATAFORMAS.STEAM)).toBe(true);
    },
  );

  it.each([null, '', 'PS5', 'ps4', ' PS3 ', 'PSP', 'PS1', 'PS2'])(
    'PlayStation: %j não pede confirmação',
    (valor) => {
      expect(precisaConfirmarPlataforma(valor, PLATAFORMAS.PLAYSTATION)).toBe(false);
    },
  );

  it.each(['Xbox One', 'Nintendo Switch', 'PC', 'Steam Deck'])(
    'PlayStation: %s pede confirmação',
    (valor) => {
      expect(precisaConfirmarPlataforma(valor, PLATAFORMAS.PLAYSTATION)).toBe(true);
    },
  );
});

describe('plataformaDoNovoJogo', () => {
  const item = (plataformaSugerida?: string | null) =>
    ({ plataformaSugerida }) as Parameters<typeof plataformaDoNovoJogo>[0];

  it('usa a sugestão do item (PS5, PS4…) e, sem ela, a padrão do cadastro', () => {
    expect(plataformaDoNovoJogo(item('PS5'), PLATAFORMAS.PLAYSTATION)).toBe('PS5');
    expect(plataformaDoNovoJogo(item(null), PLATAFORMAS.STEAM)).toBe('PC');
    expect(plataformaDoNovoJogo(item(undefined), PLATAFORMAS.STEAM)).toBe('PC');
  });

  it('PlayStation sem sugestão (categoria desconhecida) fica vazia, para a pessoa escolher', () => {
    expect(plataformaDoNovoJogo(item(null), PLATAFORMAS.PLAYSTATION)).toBe('');
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
