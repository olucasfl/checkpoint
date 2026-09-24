import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';
import { connectivity } from './connectivity';

const original = apiClient.defaults.adapter;

/** Troca o transporte do apiClient, mantendo os interceptors reais (é o que está sob teste). */
function respondWith(handler: (config: InternalAxiosRequestConfig) => Promise<unknown>) {
  const adapter = vi.fn(handler);
  apiClient.defaults.adapter = adapter as unknown as AxiosAdapter;
  return adapter;
}

const ok = (config: InternalAxiosRequestConfig, status = 200) =>
  Promise.resolve({ data: {}, status, statusText: '', headers: {}, config });

function failWith(config: InternalAxiosRequestConfig, code: string, status?: number) {
  const response =
    status === undefined ? undefined : { data: {}, status, statusText: '', headers: {}, config };
  return Promise.reject(new AxiosError('falhou', code, config, undefined, response));
}

beforeEach(() => {
  vi.useFakeTimers();
  connectivity.reportReachable();
});

afterEach(() => {
  connectivity.reportReachable();
  apiClient.defaults.adapter = original;
  vi.useRealTimers();
});

describe('interceptor do apiClient', () => {
  it.each(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'])(
    'chamada sem resposta (%s) → sem-servidor',
    async (code) => {
      respondWith((config) => failWith(config, code));

      await expect(apiClient.get('/games')).rejects.toBeInstanceOf(AxiosError);

      expect(connectivity.getState()).toBe('sem-servidor');
    },
  );

  it('sem resposta com navigator.onLine falso → offline', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    respondWith((config) => failWith(config, 'ERR_NETWORK'));

    await expect(apiClient.get('/games')).rejects.toBeInstanceOf(AxiosError);

    expect(connectivity.getState()).toBe('offline');
    online.mockRestore();
  });

  it('qualquer resposta HTTP, até 4xx e 5xx, → online', async () => {
    connectivity.reportUnreachable();
    respondWith((config) => failWith(config, 'ERR_BAD_RESPONSE', 500));

    await expect(apiClient.get('/games')).rejects.toBeInstanceOf(AxiosError);

    expect(connectivity.getState()).toBe('online');
  });

  it('resposta 200 → online', async () => {
    connectivity.reportUnreachable();
    respondWith((config) => ok(config));

    await apiClient.get('/games');

    expect(connectivity.getState()).toBe('online');
  });

  it('o erro original continua chegando a quem chamou (o interceptor só observa)', async () => {
    respondWith((config) => failWith(config, 'ERR_NETWORK'));

    await expect(apiClient.get('/games')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('cancelamento (ERR_CANCELED) não conta como queda de conexão', async () => {
    respondWith((config) => failWith(config, 'ERR_CANCELED'));

    await expect(apiClient.get('/games')).rejects.toBeInstanceOf(AxiosError);

    expect(connectivity.getState()).toBe('online');
  });

  it('erro que não é do axios passa adiante sem mexer no estado', async () => {
    respondWith(() => Promise.reject(new Error('boom')));

    await expect(apiClient.get('/games')).rejects.toThrow('boom');

    expect(connectivity.getState()).toBe('online');
  });
});

describe('sondagem pelo mesmo apiClient (anti-laço)', () => {
  it('a sondagem é um GET /health marcado, pelo apiClient (sem segundo axios.create)', async () => {
    connectivity.reportUnreachable();
    const adapter = respondWith((config) => ok(config));

    await vi.advanceTimersByTimeAsync(5_000);

    expect(adapter).toHaveBeenCalledTimes(1);
    const config = adapter.mock.calls[0]?.[0] as
      (InternalAxiosRequestConfig & { isConnectivityProbe?: boolean }) | undefined;
    expect(config?.method).toBe('get');
    expect(config?.url).toBe('/health');
    expect(config?.isConnectivityProbe).toBe(true);
    expect(connectivity.getState()).toBe('online');
  });

  it('sondagem sem resposta NÃO realimenta o detector: um agendamento só, no ritmo 5/10/20 s', async () => {
    connectivity.reportUnreachable();
    const adapter = respondWith((config) => failWith(config, 'ERR_NETWORK'));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(adapter).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(adapter).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(adapter).toHaveBeenCalledTimes(3);
    expect(connectivity.getState()).toBe('sem-servidor');
  });

  it('sondagem que recebe 500 já prova que a API está de pé → online', async () => {
    connectivity.reportUnreachable();
    respondWith((config) => ok(config, 500));

    await vi.advanceTimersByTimeAsync(5_000);

    expect(connectivity.getState()).toBe('online');
  });
});
