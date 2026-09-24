import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type AuthResponse } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSAO_ATIVA } from '@/features/auth/lib/session-keys';
import { authApi } from '@/features/auth/api/auth-api';
import { boot, entrar, resetSessionForTests, getSession } from '@/features/auth/session/session';
import { gamesApi } from '@/features/games/api/games-api';
import { queryClient } from '@/shared/lib/query-client';
import { storage } from '@/shared/lib/storage/storage';
import { routes } from './routes';

vi.mock('@/features/auth/api/auth-api', () => ({
  authApi: { refresh: vi.fn(), logout: vi.fn(), login: vi.fn(), registro: vi.fn(), me: vi.fn() },
}));
vi.mock('@/features/games/api/games-api', () => ({
  gamesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    uploadCover: vi.fn(),
    removeCover: vi.fn(),
  },
}));
// O diagnóstico faria uma request real de /health; aqui só importa que a rota é pública.
vi.mock('@/pages/StatusPage', () => ({ StatusPage: () => <main>Diagnóstico</main> }));

const api = vi.mocked(authApi);
const games = vi.mocked(gamesApi);

const usuario = {
  id: 'u1',
  nome: 'Ana Teste',
  email: 'ana@exemplo.com',
  criadoEm: '2026-09-24T12:00:00.000Z',
};
const auth: AuthResponse = { accessToken: 'token', usuario };

function unauthorized(): AxiosError {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 401,
    data: { statusCode: 401, code: 'AUTH_SESSAO_ENCERRADA', message: 'x' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

function renderAt(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const where = () => `${router.state.location.pathname}${router.state.location.search}`;
  return { router, where, user: userEvent.setup({ applyAccept: false }) };
}

async function asVisitor(hadSession = false) {
  if (hadSession) {
    storage.set(SESSAO_ATIVA, true);
  }
  api.refresh.mockRejectedValue(unauthorized());
  await boot();
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  storage.clearScope('usuario');
  queryClient.clear();
  games.list.mockResolvedValue([]);
});

afterEach(() => {
  document.getElementById('overlay-root')?.remove();
});

describe('RequireAuth — visitante (CA-23, CA-29, CA-33)', () => {
  it('sem sessão em "/": vai para /login?voltar=%2F, SEM a mensagem "Sua sessão terminou" (CA-23)', async () => {
    await asVisitor();

    const { where } = renderAt('/');

    await waitFor(() => expect(where()).toBe('/login?voltar=%2F'));
    expect(screen.queryByText('Sua sessão terminou. Entre de novo.')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(games.list).not.toHaveBeenCalled();
  });

  it('a sessão terminou: /login?motivo=sessao&voltar=… com a mensagem (CA-29)', async () => {
    await asVisitor(true);

    const { where } = renderAt('/?status=ZERADO');

    await waitFor(() => expect(where()).toBe('/login?motivo=sessao&voltar=%2F%3Fstatus%3DZERADO'));
    expect(await screen.findByText('Sua sessão terminou. Entre de novo.')).toBeInTheDocument();
  });

  it('depois de SAIR: /login limpo, sem voltar e sem mensagem (CA-33)', async () => {
    api.logout.mockResolvedValue(undefined);
    entrar(auth);
    const { where, user } = renderAt('/perfil');
    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(where()).toBe('/login'));
    expect(screen.queryByText('Sua sessão terminou. Entre de novo.')).not.toBeInTheDocument();
    expect(storage.get(SESSAO_ATIVA)).toBe(false);
  });

  it('o "voltar" do navegador para uma tela logada, depois de sair, cai de novo no login (CA-33)', async () => {
    api.logout.mockResolvedValue(undefined);
    entrar(auth);
    const { router, where, user } = renderAt('/perfil');
    await user.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(where()).toBe('/login'));

    await router.navigate('/');

    await waitFor(() => expect(where()).toBe('/login'));
    expect(games.list).not.toHaveBeenCalled();
  });

  it('/status é público: um visitante o vê sem ser redirecionado', async () => {
    await asVisitor();

    const { where } = renderAt('/status');

    expect(await screen.findByText('Diagnóstico')).toBeInTheDocument();
    expect(where()).toBe('/status');
  });
});

describe('RequireAuth — carregando e desconectado', () => {
  it('carregando: só o logo, e NENHUMA query da tela sai antes do boot (CA-26)', () => {
    renderAt('/');

    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.queryByText('Adicionar jogo')).not.toBeInTheDocument();
    expect(games.list).not.toHaveBeenCalled();
  });

  it('sem conexão no boot: o app com "Sem conexão…", SEM redirecionar para o login (CA-30)', async () => {
    storage.set(SESSAO_ATIVA, true);
    api.refresh.mockRejectedValue(networkError());
    await boot();

    const { where } = renderAt('/');

    expect(
      await screen.findByText('Sem conexão. Seu catálogo aparece quando a conexão voltar.'),
    ).toBeInTheDocument();
    expect(where()).toBe('/');
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(games.list).not.toHaveBeenCalled();
  });

  it('"Tentar de novo" refaz o boot e, com resposta, mostra o catálogo ainda logado (CA-30)', async () => {
    api.refresh.mockRejectedValueOnce(networkError());
    await boot();
    const { user } = renderAt('/');
    api.refresh.mockResolvedValue(auth);

    await user.click(await screen.findByRole('button', { name: 'TENTAR DE NOVO' }));

    expect(await screen.findByText('Nenhum jogo cadastrado')).toBeInTheDocument();
    expect(getSession().status).toBe('autenticado');
  });
});

describe('AuthLayout — quem já entrou (CA-31, CA-32)', () => {
  beforeEach(() => {
    entrar(auth);
  });

  it.each(['/login', '/registro'])('logado em %s vai para "/" (CA-32)', async (path) => {
    const { where } = renderAt(path);

    await waitFor(() => expect(where()).toBe('/'));
    expect(await screen.findByText('Nenhum jogo cadastrado')).toBeInTheDocument();
  });

  it('/login?voltar=/perfil leva a /perfil (CA-31)', async () => {
    const { where } = renderAt('/login?voltar=/perfil');

    await waitFor(() => expect(where()).toBe('/perfil'));
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it.each([
    ['//malicioso.exemplo'],
    ['https://malicioso.exemplo'],
    ['/\\malicioso.exemplo'],
    ['/login'],
  ])('voltar=%j leva a "/" (CA-31)', async (voltar) => {
    const { where } = renderAt(`/login?voltar=${encodeURIComponent(voltar)}`);

    await waitFor(() => expect(where()).toBe('/'));
  });

  it('/registro ignora o voltar: vai sempre para "/"', async () => {
    const { where } = renderAt('/registro?voltar=/perfil');

    await waitFor(() => expect(where()).toBe('/'));
  });
});

describe('AuthLayout — visitante e carregando', () => {
  it('um visitante vê o formulário de login (sem a barra de navegação do app)', async () => {
    await asVisitor();

    renderAt('/login');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navegação principal' }),
    ).not.toBeInTheDocument();
  });

  it('/registro mostra o formulário de registro', async () => {
    await asVisitor();

    renderAt('/registro');

    expect(await screen.findByRole('button', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('enquanto o boot não responde, o formulário NÃO pisca para quem tem sessão', () => {
    renderAt('/login');

    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });
});

describe('/perfil (CA-33, CA-34, CA-36)', () => {
  it('nome, e-mail com a legenda e Sair; a barra inferior tem o item Perfil (CA-36)', async () => {
    entrar(auth);

    renderAt('/perfil');

    expect(await screen.findByText('Ana Teste')).toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('(não verificado — usado só para entrar)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    const bottom = document.querySelector<HTMLElement>('nav.bottom-nav') as HTMLElement;
    expect(within(bottom).getByRole('link', { name: 'Perfil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sem conexão, Sair NÃO sai: "Sem conexão. Para sair, conecte-se." e continua logado (CA-34)', async () => {
    api.logout.mockRejectedValue(networkError());
    entrar(auth);
    const { where, user } = renderAt('/perfil');

    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('Sem conexão. Para sair, conecte-se.')).toBeInTheDocument();
    expect(where()).toBe('/perfil');
    expect(getSession().status).toBe('autenticado');
    expect(screen.getByText('Ana Teste')).toBeInTheDocument();
  });

  it('Sair chama o logout da API uma vez', async () => {
    api.logout.mockResolvedValue(undefined);
    entrar(auth);
    const { where, user } = renderAt('/perfil');

    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(where()).toBe('/login'));
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('o item Perfil da barra leva a /perfil a partir do catálogo', async () => {
    entrar(auth);
    const { where, user } = renderAt('/');
    await screen.findByText('Nenhum jogo cadastrado');

    const bottom = document.querySelector<HTMLElement>('nav.bottom-nav') as HTMLElement;
    await user.click(within(bottom).getByRole('link', { name: 'Perfil' }));

    await waitFor(() => expect(where()).toBe('/perfil'));
  });
});
