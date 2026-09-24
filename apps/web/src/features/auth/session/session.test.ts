import { AxiosError } from 'axios';
import { type AuthResponse } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '@/shared/lib/auth-token';
import { queryClient } from '@/shared/lib/query-client';
import { DIAS_DE_USO, DISPENSADO_EM, INSTALADO } from '@/shared/lib/pwa/install-keys';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { SESSAO_ATIVA } from '../lib/session-keys';
import {
  AUTH_CHANNEL,
  boot,
  encerrarLocal,
  entrar,
  getSession,
  listenToOtherTabs,
  resetSessionForTests,
  sair,
} from './session';

vi.mock('../api/auth-api', () => ({
  authApi: { refresh: vi.fn(), logout: vi.fn(), login: vi.fn(), registro: vi.fn(), me: vi.fn() },
}));
const api = vi.mocked(authApi);

const usuario = {
  id: 'u1',
  nome: 'Ana Teste',
  email: 'ana@exemplo.com',
  criadoEm: '2026-09-24T12:00:00.000Z',
};
const auth: AuthResponse = { accessToken: 'token-em-memoria', usuario };

function httpError(status: number, code?: string): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: code ? { statusCode: status, code, message: 'x' } : {},
    statusText: '',
    headers: {},
    config: {} as never,
  });
}
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  storage.clearScope('usuario');
  storage.clearScope('dispositivo');
  queryClient.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('boot (CA-26)', () => {
  it('refresh 200 → autenticado, token SÓ em memória e sessao:ativa gravada', async () => {
    api.refresh.mockResolvedValue(auth);

    await boot();

    expect(getSession()).toEqual({ status: 'autenticado', usuario, saida: null });
    expect(getAccessToken()).toBe('token-em-memoria');
    expect(storage.get(SESSAO_ATIVA)).toBe(true);
  });

  it('começa em "carregando" e só sai dele quando o refresh responde', async () => {
    let responder: (value: AuthResponse) => void = () => undefined;
    api.refresh.mockReturnValue(new Promise((resolve) => (responder = resolve)));

    const pronto = boot();
    expect(getSession().status).toBe('carregando');
    responder(auth);
    await pronto;

    expect(getSession().status).toBe('autenticado');
  });

  it('é UMA promessa só: duas chamadas (StrictMode) fazem um único refresh', async () => {
    api.refresh.mockResolvedValue(auth);

    await Promise.all([boot(), boot()]);

    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('401 e NUNCA entrou neste navegador → visitante, sem aviso (CA-23)', async () => {
    api.refresh.mockRejectedValue(httpError(401, 'AUTH_SESSAO_ENCERRADA'));

    await boot();

    expect(getSession()).toEqual({ status: 'visitante', usuario: null, saida: null });
  });

  it('401 e TINHA sessão (sessao:ativa) → "a sessão terminou", e a chave sai', async () => {
    storage.set(SESSAO_ATIVA, true);
    api.refresh.mockRejectedValue(httpError(401, 'AUTH_SESSAO_ENCERRADA'));

    await boot();

    expect(getSession()).toEqual({ status: 'visitante', usuario: null, saida: 'sessao' });
    expect(storage.get(SESSAO_ATIVA)).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('sem rede → "desconectado" (NÃO visitante: não manda para o login) (CA-30)', async () => {
    storage.set(SESSAO_ATIVA, true);
    api.refresh.mockRejectedValue(networkError());

    await boot();

    expect(getSession().status).toBe('desconectado');
    expect(storage.get(SESSAO_ATIVA)).toBe(true);
  });

  it('5xx e 429 também não decidem nada sobre a sessão: "desconectado"', async () => {
    api.refresh.mockRejectedValue(httpError(503));
    await boot();
    expect(getSession().status).toBe('desconectado');

    api.refresh.mockRejectedValue(httpError(429, 'LIMITE_TENTATIVAS'));
    await boot();
    expect(getSession().status).toBe('desconectado');
  });

  it('409 (outra aba renovou junto): espera 500 ms e tenta UMA vez mais', async () => {
    vi.useFakeTimers();
    api.refresh
      .mockRejectedValueOnce(httpError(409, 'AUTH_REFRESH_CONCORRENTE'))
      .mockResolvedValueOnce(auth);

    const pronto = boot();
    await vi.advanceTimersByTimeAsync(499);
    expect(api.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pronto;

    expect(api.refresh).toHaveBeenCalledTimes(2);
    expect(getSession().status).toBe('autenticado');
  });

  it('409 duas vezes: desiste sem deslogar ("desconectado")', async () => {
    vi.useFakeTimers();
    api.refresh.mockRejectedValue(httpError(409, 'AUTH_REFRESH_CONCORRENTE'));

    const pronto = boot();
    await vi.advanceTimersByTimeAsync(500);
    await pronto;

    expect(api.refresh).toHaveBeenCalledTimes(2);
    expect(getSession().status).toBe('desconectado');
  });

  it('refaz o boot depois de "desconectado" (a conexão voltou)', async () => {
    api.refresh.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(auth);

    await boot();
    expect(getSession().status).toBe('desconectado');
    await boot();

    expect(getSession().status).toBe('autenticado');
  });
});

describe('entrar (login/registro)', () => {
  it('limpa o cache de queries ANTES: os dados do usuário anterior nunca aparecem', () => {
    queryClient.setQueryData(['games'], [{ id: 'da-ana' }]);

    entrar(auth);

    expect(queryClient.getQueryData(['games'])).toBeUndefined();
    expect(getSession().status).toBe('autenticado');
    expect(getAccessToken()).toBe('token-em-memoria');
    expect(storage.get(SESSAO_ATIVA)).toBe(true);
  });
});

describe('logout local (CA-33)', () => {
  it('apaga token, cache e as chaves do escopo usuario; as chaves instalacao:* ficam', () => {
    entrar(auth);
    storage.set(DISPENSADO_EM, 1_700_000_000_000);
    storage.set(INSTALADO, true);
    storage.set(DIAS_DE_USO, { ultimoDia: '2026-09-24', total: 3 });
    queryClient.setQueryData(['games'], [1]);

    encerrarLocal('usuario');

    expect(getSession()).toEqual({ status: 'visitante', usuario: null, saida: 'usuario' });
    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(['games'])).toBeUndefined();
    expect(storage.get(SESSAO_ATIVA)).toBe(false);
    expect(storage.raw.get('checkpoint:sessao:ativa')).toBeNull();
    expect(storage.get(DISPENSADO_EM)).toBe(1_700_000_000_000);
    expect(storage.get(INSTALADO)).toBe(true);
    expect(storage.get(DIAS_DE_USO)).toEqual({ ultimoDia: '2026-09-24', total: 3 });
  });
});

describe('sair', () => {
  it('chama o logout da API, faz o logout local e avisa as outras abas', async () => {
    api.logout.mockResolvedValue(undefined);
    entrar(auth);
    const outraAba = new BroadcastChannel(AUTH_CHANNEL);
    const recebidas: unknown[] = [];
    outraAba.onmessage = (event: MessageEvent) => recebidas.push(event.data);

    const resultado = await sair();

    expect(resultado).toBe('ok');
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(getSession()).toMatchObject({ status: 'visitante', saida: 'usuario' });
    await vi.waitFor(() => expect(recebidas).toEqual([{ type: 'logout' }]));
    outraAba.close();
  });

  it('sem conexão o logout NÃO acontece: continua logado, com o token (CA-34)', async () => {
    api.logout.mockRejectedValue(networkError());
    entrar(auth);

    const resultado = await sair();

    expect(resultado).toBe('sem-conexao');
    expect(getSession().status).toBe('autenticado');
    expect(getAccessToken()).toBe('token-em-memoria');
    expect(storage.get(SESSAO_ATIVA)).toBe(true);
  });

  it('um erro do servidor também não desloga ("erro")', async () => {
    api.logout.mockRejectedValue(httpError(500));
    entrar(auth);

    await expect(sair()).resolves.toBe('erro');
    expect(getSession().status).toBe('autenticado');
  });
});

describe('outras abas (CA-35)', () => {
  it('o logout de outra aba faz o logout local aqui, na hora', async () => {
    entrar(auth);
    const parar = listenToOtherTabs();
    const outraAba = new BroadcastChannel(AUTH_CHANNEL);

    outraAba.postMessage({ type: 'logout' });

    await vi.waitFor(() => expect(getSession().status).toBe('visitante'));
    expect(getSession().saida).toBe('usuario');
    expect(getAccessToken()).toBeNull();
    parar();
    outraAba.close();
  });

  it('quem já é visitante ignora a mensagem, e uma mensagem de outro tipo também', async () => {
    entrar(auth);
    const parar = listenToOtherTabs();
    const outraAba = new BroadcastChannel(AUTH_CHANNEL);

    outraAba.postMessage({ type: 'qualquer-coisa' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getSession().status).toBe('autenticado');
    parar();
    outraAba.close();
  });

  it('depois de parar de escutar, a mensagem não tem efeito', async () => {
    entrar(auth);
    const parar = listenToOtherTabs();
    parar();
    const outraAba = new BroadcastChannel(AUTH_CHANNEL);

    outraAba.postMessage({ type: 'logout' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getSession().status).toBe('autenticado');
    outraAba.close();
  });
});
