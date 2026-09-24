import { AxiosError } from 'axios';
import { API_ERROR_CODES, type ApiErrorCode } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  AUTH_MESSAGES,
  describeAuthError,
  errorCode,
  NO_CONNECTION_MESSAGE,
  UNEXPECTED_MESSAGE,
} from './auth-errors';

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

describe('AUTH_MESSAGES (CA-38)', () => {
  it('todo ApiErrorCode do shared tem texto (o tipo Record<ApiErrorCode, string> quebra o typecheck se faltar)', () => {
    for (const code of API_ERROR_CODES) {
      expect(AUTH_MESSAGES[code], code).toEqual(expect.any(String));
      expect(AUTH_MESSAGES[code].length).toBeGreaterThan(0);
    }
    expect(Object.keys(AUTH_MESSAGES).sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it('os textos da spec', () => {
    expect(AUTH_MESSAGES.AUTH_CREDENCIAIS_INVALIDAS).toBe('E-mail ou senha incorretos.');
    expect(AUTH_MESSAGES.AUTH_SESSAO_ENCERRADA).toBe('Sua sessão terminou. Entre de novo.');
    expect(AUTH_MESSAGES.AUTH_EMAIL_EM_USO).toBe(
      'Este e-mail já tem uma conta. Entre com a sua senha.',
    );
    expect(AUTH_MESSAGES.AUTH_REGISTRO_FECHADO).toBe('O cadastro de novas contas está fechado.');
    expect(AUTH_MESSAGES.AUTH_NAO_AUTENTICADO).toBe('Entre para continuar.');
    expect(AUTH_MESSAGES.AUTH_SENHA_ATUAL_INCORRETA).toBe('Senha atual incorreta.');
    expect(AUTH_MESSAGES.AUTH_SENHA_IGUAL_ATUAL).toBe(
      'A nova senha precisa ser diferente da atual.',
    );
    expect(AUTH_MESSAGES.AUTH_ORIGEM_INVALIDA).toBe('Não foi possível completar a requisição.');
    expect(AUTH_MESSAGES.LIMITE_TENTATIVAS).toBe(
      'Muitas tentativas. Aguarde um pouco e tente de novo.',
    );
    // Sessões ativas (spec perfil, etapa 2).
    expect(AUTH_MESSAGES.SESSAO_ATUAL).toBe('Para encerrar esta sessão, use Sair.');
    expect(AUTH_MESSAGES.SESSAO_NAO_ENCONTRADA).toBe('Essa sessão já foi encerrada.');
  });
});

describe('describeAuthError', () => {
  it('o texto sai do code, NUNCA da message da API (CA-38)', () => {
    const error = httpError(401, {
      statusCode: 401,
      code: 'AUTH_CREDENCIAIS_INVALIDAS',
      message: 'ISTO NÃO PODE APARECER',
    });

    expect(describeAuthError(error)).toEqual({
      message: 'E-mail ou senha incorretos.',
      fields: {},
      code: 'AUTH_CREDENCIAIS_INVALIDAS',
    });
  });

  it('429 → "Muitas tentativas. Aguarde um pouco e tente de novo." (CA-39)', () => {
    const error = httpError(429, { statusCode: 429, code: 'LIMITE_TENTATIVAS', message: 'x' });

    expect(describeAuthError(error).message).toBe(
      'Muitas tentativas. Aguarde um pouco e tente de novo.',
    );
  });

  it('com campos apontados, a mensagem geral fica vazia (não repete o texto do campo)', () => {
    const error = httpError(400, {
      statusCode: 400,
      code: 'VALIDACAO',
      message: 'Dados inválidos',
      fields: {
        email: 'Informe um e-mail válido',
        senha: 'A senha deve ter pelo menos 8 caracteres',
      },
    });

    expect(describeAuthError(error)).toEqual({
      message: '',
      fields: {
        email: 'Informe um e-mail válido',
        senha: 'A senha deve ter pelo menos 8 caracteres',
      },
      code: 'VALIDACAO',
    });
  });

  it('409 de e-mail em uso com fields.email', () => {
    const error = httpError(409, {
      statusCode: 409,
      code: 'AUTH_EMAIL_EM_USO',
      message: 'Este e-mail já tem uma conta',
      fields: { email: 'Este e-mail já tem uma conta' },
    });

    expect(describeAuthError(error).fields).toEqual({ email: 'Este e-mail já tem uma conta' });
  });

  it('sem resposta (rede) → mensagem de sem conexão', () => {
    expect(describeAuthError(new AxiosError('Network Error', 'ERR_NETWORK'))).toEqual({
      message: NO_CONNECTION_MESSAGE,
      fields: {},
    });
  });

  it.each([
    ['sem code', httpError(500, {})],
    ['code desconhecido', httpError(400, { code: 'CODIGO_QUE_NAO_EXISTE' })],
    ['corpo que não é objeto', httpError(500, '<html>erro</html>')],
    ['erro que não é do axios', new Error('boom')],
    ['valor qualquer', 'texto'],
  ])('%s → mensagem genérica', (_nome, error) => {
    expect(describeAuthError(error)).toEqual({ message: UNEXPECTED_MESSAGE, fields: {} });
  });
});

describe('errorCode', () => {
  it('devolve só códigos conhecidos', () => {
    const code: ApiErrorCode = 'AUTH_TOKEN_EXPIRADO';

    expect(errorCode(httpError(401, { code }))).toBe(code);
    expect(errorCode(httpError(401, { code: 'nada' }))).toBeUndefined();
    expect(errorCode(new Error('x'))).toBeUndefined();
  });
});
