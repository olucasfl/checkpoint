import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { type AuthResponse } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type ApiRequestConfig } from '@/shared/lib/api-client';
import { getAccessToken, setAccessToken } from '@/shared/lib/auth-token';
import { connectivity } from '@/shared/lib/connectivity';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { SESSAO_ATIVA } from '../lib/session-keys';
import { entrar, getSession, resetSessionForTests } from './session';

/**
 * O interceptor do `apiClient` COM a sessão real (`session.ts`), trocando só o transporte do axios:
 * conta os `POST /auth/refresh` que de fato saem (CA-28) e confere o que cada request leva.
 */
const usuario = {
  id: 'u1',
  nome: 'Ana Teste',
  email: 'ana@exemplo.com',
  criadoEm: '2026-09-24T12:00:00.000Z',
};
const renovada: AuthResponse = { accessToken: 'token-novo', usuario };
const original = apiClient.defaults.adapter;

interface Reply {
  status: number;
  data?: unknown;
}

function erro(code: string, status = 401): Reply {
  return { status, data: { statusCode: status, code, message: 'texto que o web NUNCA compara' } };
}

/** Troca o transporte: `handler` decide a resposta de cada requisição. Devolve as chamadas feitas. */
function transporte(handler: (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>) {
  const calls: InternalAxiosRequestConfig[] = [];
  apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    calls.push(config);
    const reply = await handler(config);
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: '',
      headers: {},
      config,
    };
    if (reply.status >= 400) {
      throw new AxiosError('falhou', 'ERR_BAD_REQUEST', config, undefined, response);
    }
    return response;
  }) as AxiosAdapter;
  return calls;
}

const semRede = (config: InternalAxiosRequestConfig) => {
  throw new AxiosError('Network Error', 'ERR_NETWORK', config);
};

const authorization = (config: InternalAxiosRequestConfig) =>
  config.headers.get('Authorization') as string | undefined;
const refreshCalls = (calls: InternalAxiosRequestConfig[]) =>
  calls.filter((call) => call.url === '/auth/refresh');

beforeEach(() => {
  resetSessionForTests();
  storage.clearScope('usuario');
  entrar({ accessToken: 'token-velho', usuario });
  connectivity.reportReachable();
});

afterEach(() => {
  apiClient.defaults.adapter = original;
  setAccessToken(null);
  connectivity.reportReachable();
  vi.useRealTimers();
});

describe('o Bearer', () => {
  it('vai em toda request comum quando há token em memória', async () => {
    const calls = transporte(() => ({ status: 200, data: [] }));

    await apiClient.get('/games');

    expect(authorization(calls[0] as InternalAxiosRequestConfig)).toBe('Bearer token-velho');
  });

  it('não vai sem token', async () => {
    setAccessToken(null);
    const calls = transporte(() => ({ status: 200, data: [] }));

    await apiClient.get('/games');

    expect(authorization(calls[0] as InternalAxiosRequestConfig)).toBeUndefined();
  });

  it('não vai nas chamadas de auth nem na sonda de conectividade', async () => {
    const calls = transporte(() => ({ status: 200, data: renovada }));

    await authApi.login({ email: 'ana@exemplo.com', senha: 'x' });
    await authApi.registro({ nome: 'Ana', email: 'ana@exemplo.com', senha: 'segredo-forte' });
    await apiClient.get('/health', { isConnectivityProbe: true } as ApiRequestConfig);

    expect(calls.map(authorization)).toEqual([undefined, undefined, undefined]);
  });

  it('refresh e logout levam o cookie (withCredentials) e o cabeçalho anti-CSRF; login e registro só o cookie', async () => {
    const calls = transporte(() => ({ status: 200, data: renovada }));

    await authApi.refresh();
    await authApi.logout();
    await authApi.login({ email: 'ana@exemplo.com', senha: 'x' });

    const [refresh, logout, login] = calls as [
      InternalAxiosRequestConfig,
      InternalAxiosRequestConfig,
      InternalAxiosRequestConfig,
    ];
    expect(refresh.withCredentials).toBe(true);
    expect(logout.withCredentials).toBe(true);
    expect(login.withCredentials).toBe(true);
    expect(refresh.headers.get('X-Checkpoint-Csrf')).toBe('1');
    expect(logout.headers.get('X-Checkpoint-Csrf')).toBe('1');
    expect(login.headers.get('X-Checkpoint-Csrf')).toBeUndefined();
  });

  it('requests comuns NÃO levam withCredentials (só as de auth recebem o cookie)', async () => {
    const calls = transporte(() => ({ status: 200, data: [] }));

    await apiClient.get('/games');

    expect((calls[0] as InternalAxiosRequestConfig).withCredentials).toBeFalsy();
  });
});

describe('AUTH_TOKEN_EXPIRADO: UMA renovação compartilhada (CA-28)', () => {
  /** /games recusa o token velho e aceita o novo; /auth/refresh devolve o token novo. */
  function apiComToken(): InternalAxiosRequestConfig[] {
    return transporte((config) => {
      if (config.url === '/auth/refresh') {
        return { status: 200, data: renovada };
      }
      return authorization(config) === 'Bearer token-novo'
        ? { status: 200, data: [{ id: 'g1' }] }
        : erro('AUTH_TOKEN_EXPIRADO');
    });
  }

  it('três requests paralelas com o token vencido: sai EXATAMENTE um POST /auth/refresh e as três são repetidas', async () => {
    const calls = apiComToken();

    const results = await Promise.all([
      apiClient.get('/games'),
      apiClient.get('/games?status=ZERADO'),
      apiClient.get('/games?status=JOGANDO'),
    ]);

    expect(refreshCalls(calls)).toHaveLength(1);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const repetidas = calls.filter((call) => authorization(call) === 'Bearer token-novo');
    expect(repetidas.filter((call) => call.url !== '/auth/refresh')).toHaveLength(3);
    // 3 tentativas com o token velho + 1 refresh + 3 repetições
    expect(calls).toHaveLength(7);
    expect(getAccessToken()).toBe('token-novo');
  });

  it('cada request é repetida UMA vez só: se a repetição também der 401, rejeita (sem laço)', async () => {
    const calls = transporte((config) =>
      config.url === '/auth/refresh'
        ? { status: 200, data: renovada }
        : erro('AUTH_TOKEN_EXPIRADO'),
    );

    await expect(apiClient.get('/games')).rejects.toMatchObject({ response: { status: 401 } });

    expect(calls.filter((call) => call.url === '/games')).toHaveLength(2);
    expect(refreshCalls(calls)).toHaveLength(1);
  });

  it('a sessão continua autenticada depois da renovação', async () => {
    apiComToken();

    await apiClient.get('/games');

    expect(getSession()).toMatchObject({ status: 'autenticado', usuario });
  });
});

describe('409 AUTH_REFRESH_CONCORRENTE: tenta de novo uma vez', () => {
  it('a segunda tentativa passa: a request original é repetida com o token novo', async () => {
    vi.useFakeTimers();
    let tentativas = 0;
    const calls = transporte((config) => {
      if (config.url === '/auth/refresh') {
        tentativas += 1;
        return tentativas === 1
          ? erro('AUTH_REFRESH_CONCORRENTE', 409)
          : { status: 200, data: renovada };
      }
      return authorization(config) === 'Bearer token-novo'
        ? { status: 200, data: [] }
        : erro('AUTH_TOKEN_EXPIRADO');
    });

    const pedido = apiClient.get('/games');
    await vi.advanceTimersByTimeAsync(500);
    const response = await pedido;

    expect(response.status).toBe(200);
    expect(refreshCalls(calls)).toHaveLength(2);
  });

  it('se o 409 se repete, desiste: NÃO desloga (a sessão pode estar viva) e rejeita a original', async () => {
    vi.useFakeTimers();
    const calls = transporte((config) =>
      config.url === '/auth/refresh'
        ? erro('AUTH_REFRESH_CONCORRENTE', 409)
        : erro('AUTH_TOKEN_EXPIRADO'),
    );

    const pedido = apiClient.get('/games');
    const rejeitada = expect(pedido).rejects.toMatchObject({ response: { status: 409 } });
    await vi.advanceTimersByTimeAsync(500);
    await rejeitada;

    expect(refreshCalls(calls)).toHaveLength(2);
    expect(getSession().status).toBe('autenticado');
  });
});

describe('AUTH_SESSAO_ENCERRADA → logout local (CA-29)', () => {
  it('vira visitante com o motivo "sessao", sem token e sem a chave sessao:ativa', async () => {
    const calls = transporte(() => erro('AUTH_SESSAO_ENCERRADA'));

    await expect(apiClient.get('/games')).rejects.toMatchObject({ response: { status: 401 } });

    expect(getSession()).toMatchObject({ status: 'visitante', usuario: null, saida: 'sessao' });
    expect(getAccessToken()).toBeNull();
    expect(storage.get(SESSAO_ATIVA)).toBe(false);
    // Não adianta renovar: nenhum refresh.
    expect(refreshCalls(calls)).toHaveLength(0);
  });

  it('o refresh que dá 401 também é logout local', async () => {
    transporte((config) =>
      config.url === '/auth/refresh' ? erro('AUTH_SESSAO_ENCERRADA') : erro('AUTH_TOKEN_EXPIRADO'),
    );

    await expect(apiClient.get('/games')).rejects.toMatchObject({ response: { status: 401 } });

    expect(getSession()).toMatchObject({ status: 'visitante', saida: 'sessao' });
  });

  it('um visitante (sem sessão) que recebe 401 só rejeita: não "desloga" nem renova', async () => {
    const { encerrarLocal } = await import('./session');
    encerrarLocal('usuario');
    const antes = getSession();
    const calls = transporte(() => erro('AUTH_SESSAO_ENCERRADA'));

    await expect(apiClient.get('/games')).rejects.toMatchObject({ response: { status: 401 } });

    expect(getSession()).toBe(antes);
    expect(refreshCalls(calls)).toHaveLength(0);
  });
});

describe('sem rede na renovação: não desloga', () => {
  it('a request original falha como erro de rede e a sessão continua autenticada', async () => {
    transporte((config) =>
      config.url === '/auth/refresh' ? semRede(config) : erro('AUTH_TOKEN_EXPIRADO'),
    );

    await expect(apiClient.get('/games')).rejects.toMatchObject({ code: 'ERR_NETWORK' });

    expect(getSession().status).toBe('autenticado');
    expect(getAccessToken()).toBe('token-velho');
  });

  it('um 5xx na renovação também não desloga', async () => {
    transporte((config) =>
      config.url === '/auth/refresh' ? { status: 503, data: {} } : erro('AUTH_TOKEN_EXPIRADO'),
    );

    await expect(apiClient.get('/games')).rejects.toMatchObject({ response: { status: 503 } });

    expect(getSession().status).toBe('autenticado');
  });
});

describe('o que NÃO passa pela renovação', () => {
  it('a sonda de conectividade: um 401 dela não dispara refresh nem logout', async () => {
    const calls = transporte(() => erro('AUTH_TOKEN_EXPIRADO'));

    await expect(
      apiClient.get('/health', { isConnectivityProbe: true } as ApiRequestConfig),
    ).rejects.toBeDefined();

    expect(refreshCalls(calls)).toHaveLength(0);
    expect(getSession().status).toBe('autenticado');
  });

  it('as chamadas de auth: um 401 do login não renova (senão um refresh renovaria a si mesmo)', async () => {
    const calls = transporte(() => erro('AUTH_CREDENCIAIS_INVALIDAS'));

    await expect(authApi.login({ email: 'ana@exemplo.com', senha: 'x' })).rejects.toBeDefined();
    await expect(authApi.refresh()).rejects.toBeDefined();

    expect(refreshCalls(calls)).toHaveLength(1); // só o que o próprio teste chamou
    expect(getSession().status).toBe('autenticado');
  });

  it.each(['AUTH_NAO_AUTENTICADO', 'AUTH_ORIGEM_INVALIDA'])(
    'o 401/403 com outro code (%s) só rejeita',
    async (code) => {
      const calls = transporte(() => erro(code));

      await expect(apiClient.get('/games')).rejects.toBeDefined();

      expect(refreshCalls(calls)).toHaveLength(0);
      expect(getSession().status).toBe('autenticado');
    },
  );

  it('erros que não são 401 passam intactos (400 de validação)', async () => {
    transporte(() => erro('VALIDACAO', 400));

    await expect(apiClient.post('/games', {})).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('a sonda que responde 200 segue normal e mantém o detector de conectividade', async () => {
    connectivity.reportUnreachable();
    transporte(() => ({ status: 200, data: {} }));

    await apiClient.get('/health', { isConnectivityProbe: true } as ApiRequestConfig);

    expect(connectivity.getState()).toBe('online');
  });
});
