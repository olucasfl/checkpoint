import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  describeError,
  forForm,
  NO_ANSWER,
  OFFLINE_COVER_NOT_SAVED,
  OFFLINE_NOT_SAVED,
  UNEXPECTED_ERROR,
} from './api-error';

/** Erro do axios como o `apiClient` o produz quando a API responde com um status de erro. */
function httpError(status: number, data: unknown): AxiosError {
  const response = { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse;
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('describeError — mapeia fields da ApiErrorResponse para os campos (CA-44)', () => {
  it('409 de duplicata aponta o campo Título com a mensagem literal', () => {
    const error = describeError(
      httpError(409, {
        statusCode: 409,
        message: 'Já existe esse jogo nesta plataforma',
        fields: { titulo: 'Já existe esse jogo nesta plataforma' },
      }),
    );

    expect(error.fields).toEqual({ titulo: 'Já existe esse jogo nesta plataforma' });
  });

  it('400 da regra da nota aponta o campo Nota', () => {
    const error = describeError(
      httpError(400, { statusCode: 400, message: 'x', fields: { nota: 'Nota só com Zerado' } }),
    );

    expect(error.fields).toEqual({ nota: 'Nota só com Zerado' });
  });

  it('`arquivo` da API vira o campo `capa` do formulário', () => {
    const error = describeError(
      httpError(413, {
        statusCode: 413,
        message: 'A capa deve ter no máximo 2 MB',
        fields: { arquivo: 'A capa deve ter no máximo 2 MB' },
      }),
    );

    expect(error.fields).toEqual({ capa: 'A capa deve ter no máximo 2 MB' });
  });

  it('mais de um campo de uma vez', () => {
    const error = describeError(
      httpError(400, {
        statusCode: 400,
        message: 'Dados inválidos',
        fields: { titulo: 'Informe o título', status: 'Status inválido' },
      }),
    );

    expect(error.fields).toEqual({ titulo: 'Informe o título', status: 'Status inválido' });
  });

  it('sem fields, sobra a mensagem geral (404, 400 sem campo)', () => {
    const error = describeError(
      httpError(404, { statusCode: 404, message: 'Jogo não encontrado', error: 'Not Found' }),
    );

    expect(error).toEqual({ message: 'Jogo não encontrado', fields: {} });
  });

  it('502 do storage aponta a capa e mantém a mensagem', () => {
    const error = describeError(
      httpError(502, {
        statusCode: 502,
        message: 'Falha ao acessar o armazenamento de capas',
        fields: { arquivo: 'Falha ao acessar o armazenamento de capas' },
      }),
    );

    expect(error.fields.capa).toBe('Falha ao acessar o armazenamento de capas');
  });
});

describe('describeError — falhas sem corpo da API', () => {
  it('API fora do ar (sem resposta) diz que nada foi salvo (CA-23)', () => {
    const error = describeError(new AxiosError('Network Error', 'ERR_NETWORK'));

    expect(error).toEqual({ message: OFFLINE_NOT_SAVED, fields: {} });
    expect(OFFLINE_NOT_SAVED).toBe(
      'Sem conexão. Nada foi salvo — tente de novo quando a conexão voltar.',
    );
  });

  it('falha da capa, com o jogo já salvo, não afirma que nada foi salvo', () => {
    const error = describeError(new AxiosError('Network Error', 'ERR_NETWORK'), 'capa');

    expect(error.message).toBe(OFFLINE_COVER_NOT_SAVED);
    expect(error.message).not.toMatch(/nada foi salvo/i);
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])(
    'tempo esgotado (%s) não afirma que nada foi salvo: o servidor pode ter gravado',
    (code) => {
      const error = describeError(new AxiosError('timeout', code));

      expect(error).toEqual({ message: NO_ANSWER, fields: {} });
      expect(error.message).not.toMatch(/nada foi salvo/i);
    },
  );

  it('resposta que não é o formato da API vira a mensagem genérica', () => {
    expect(describeError(httpError(500, '<html>erro</html>'))).toEqual({
      message: UNEXPECTED_ERROR,
      fields: {},
    });
    expect(describeError(httpError(500, null)).message).toBe(UNEXPECTED_ERROR);
  });

  it('erro que não é do axios vira a mensagem genérica', () => {
    expect(describeError(new Error('boom')).message).toBe(UNEXPECTED_ERROR);
    expect(describeError('texto').message).toBe(UNEXPECTED_ERROR);
  });

  it('ignora valores de fields que não são texto', () => {
    const error = describeError(
      httpError(400, { statusCode: 400, message: 'x', fields: { titulo: 42, nota: 'ok' } }),
    );

    expect(error.fields).toEqual({ nota: 'ok' });
  });
});

describe('forForm', () => {
  it('com campo apontado, descarta a mensagem geral (não repete o texto do campo no topo)', () => {
    expect(forForm({ message: 'dup', fields: { titulo: 'dup' } })).toEqual({
      message: '',
      fields: { titulo: 'dup' },
    });
  });

  it('sem campo, mantém a mensagem geral', () => {
    expect(forForm({ message: 'Jogo não encontrado', fields: {} })).toEqual({
      message: 'Jogo não encontrado',
      fields: {},
    });
  });
});
