import { act, render, screen } from '@testing-library/react';
import { AxiosError } from 'axios';
import { StrictMode } from 'react';
import { type AuthResponse } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectivity } from '@/shared/lib/connectivity';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { AuthProvider } from './AuthProvider';
import { AUTH_CHANNEL, entrar, resetSessionForTests } from './session';
import { useAuth } from './use-auth';

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
const auth: AuthResponse = { accessToken: 'token', usuario };

function Probe() {
  const { status, usuario: logado } = useAuth();
  return (
    <output data-testid="estado">
      {status}:{logado?.email ?? '-'}
    </output>
  );
}

function renderProvider() {
  return render(
    <StrictMode>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </StrictMode>,
  );
}

const estado = () => screen.getByTestId('estado').textContent;

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  storage.clearScope('usuario');
  connectivity.reportReachable();
});

afterEach(() => {
  connectivity.reportReachable();
});

describe('AuthProvider', () => {
  it('faz o boot ao montar, mesmo com o StrictMode montando duas vezes: UM refresh (CA-26)', async () => {
    api.refresh.mockResolvedValue(auth);

    renderProvider();
    expect(estado()).toBe('carregando:-');
    await vi.waitFor(() => expect(estado()).toBe('autenticado:ana@exemplo.com'));

    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('401 no boot → visitante', async () => {
    api.refresh.mockRejectedValue(
      new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 401,
        data: { statusCode: 401, code: 'AUTH_SESSAO_ENCERRADA', message: 'x' },
        statusText: '',
        headers: {},
        config: {} as never,
      }),
    );

    renderProvider();

    await vi.waitFor(() => expect(estado()).toBe('visitante:-'));
  });

  it('sem rede no boot fica "desconectado"; quando a conectividade volta a online, refaz o refresh sozinho (CA-30)', async () => {
    api.refresh.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    api.refresh.mockResolvedValue(auth);

    renderProvider();
    await vi.waitFor(() => expect(estado()).toBe('desconectado:-'));
    expect(api.refresh).toHaveBeenCalledTimes(1);

    act(() => {
      connectivity.reportUnreachable();
      connectivity.reportReachable();
    });

    await vi.waitFor(() => expect(estado()).toBe('autenticado:ana@exemplo.com'));
    expect(api.refresh).toHaveBeenCalledTimes(2);
  });

  it('a conectividade voltando NÃO refaz o refresh de quem já está autenticado', async () => {
    api.refresh.mockResolvedValue(auth);
    renderProvider();
    await vi.waitFor(() => expect(estado()).toBe('autenticado:ana@exemplo.com'));

    act(() => {
      connectivity.reportUnreachable();
      connectivity.reportReachable();
    });

    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('o logout de outra aba (BroadcastChannel) vira visitante aqui (CA-35)', async () => {
    api.refresh.mockResolvedValue(auth);
    renderProvider();
    await vi.waitFor(() => expect(estado()).toBe('autenticado:ana@exemplo.com'));

    const outraAba = new BroadcastChannel(AUTH_CHANNEL);
    outraAba.postMessage({ type: 'logout' });

    await vi.waitFor(() => expect(estado()).toBe('visitante:-'));
    outraAba.close();
  });

  it('ao desmontar, para de escutar as outras abas', async () => {
    api.refresh.mockResolvedValue(auth);
    const { unmount } = renderProvider();
    await vi.waitFor(() => expect(estado()).toBe('autenticado:ana@exemplo.com'));
    unmount();
    entrar(auth);

    const outraAba = new BroadcastChannel(AUTH_CHANNEL);
    outraAba.postMessage({ type: 'logout' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // ninguém escutando: o store não mudou
    const { getSession } = await import('./session');
    expect(getSession().status).toBe('autenticado');
    outraAba.close();
  });
});
