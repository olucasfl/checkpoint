import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/app/layout/RequireAuth';
import { authApi } from '@/features/auth/api/auth-api';
import {
  AUTH_CHANNEL,
  entrar,
  getSession,
  resetSessionForTests,
} from '@/features/auth/session/session';
import { gamesApi } from '@/features/games/api/games-api';
import { LoginPage } from '@/pages/LoginPage';
import { getAccessToken } from '@/shared/lib/auth-token';
import { PREFS, PREFS_PADRAO } from '@/shared/lib/prefs/prefs';
import { alterarPrefs, definirUsuario, resetPrefsForTests } from '@/shared/lib/prefs/prefs-store';
import { queryClient } from '@/shared/lib/query-client';
import { storage } from '@/shared/lib/storage/storage';
import { perfilApi } from '../api/perfil-api';
import { SEM_CONEXAO_NADA_EXCLUIDO, textoDaExclusao, ZonaDePerigo } from './ZonaDePerigo';

vi.mock('../api/perfil-api', () => ({
  perfilApi: { excluirConta: vi.fn() },
}));
vi.mock('@/features/games/api/games-api', () => ({
  gamesApi: { list: vi.fn() },
}));
vi.mock('@/features/auth/api/auth-api', () => ({
  authApi: { refresh: vi.fn(), logout: vi.fn(), login: vi.fn(), registro: vi.fn(), me: vi.fn() },
}));
const api = vi.mocked(perfilApi);
const games = vi.mocked(gamesApi);
const auth = vi.mocked(authApi);

const ANA_ID = 'u-ana';
const jogo = (id: string): Game => ({
  id,
  titulo: `Jogo ${id}`,
  plataforma: null,
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-24T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-24T12:00:00.000Z',
});

function httpError(status: number, code: string, fields?: Record<string, string>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar', ...(fields ? { fields } : {}) },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function Onde() {
  const { pathname, search } = useLocation();
  return <output data-testid="onde">{`${pathname}${search}`}</output>;
}

/** O /perfil (só a Zona de perigo) atrás do `RequireAuth` de verdade, e o /login de verdade. */
function renderPerfil() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/perfil']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/perfil" element={<ZonaDePerigo />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
        <Onde />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const dialogo = () => screen.getByRole('dialog', { name: 'Excluir conta' });
const confirmar = () => within(dialogo()).getByRole('button', { name: 'Excluir conta' });

async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Excluir conta' }));
  return dialogo();
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  resetPrefsForTests();
  storage.raw.removeAllWithPrefix('checkpoint:');
  queryClient.clear();
  games.list.mockResolvedValue([jogo('1'), jogo('2'), jogo('3')]);
  act(() => {
    entrar({
      accessToken: 'token-da-ana',
      usuario: {
        id: ANA_ID,
        nome: 'Ana',
        email: 'ana@exemplo.com',
        criadoEm: '2026-09-24T12:00:00.000Z',
      },
    });
  });
});

afterEach(() => {
  queryClient.clear();
});

describe('textoDaExclusao', () => {
  it('o número de jogos no texto da spec; 1 no singular; sem a lista, sem número', () => {
    expect(textoDaExclusao(3)).toBe(
      'Isso apaga sua conta, seus 3 jogos e as capas deles. Não dá para desfazer.',
    );
    expect(textoDaExclusao(1)).toContain('seu 1 jogo e');
    expect(textoDaExclusao(undefined)).toContain('seus jogos e');
  });
});

describe('ExcluirContaDialog (perfil CA-28, CA-30)', () => {
  it('mostra o número de jogos, o foco começa em Cancelar e "Excluir conta" fica desabilitado sem senha', async () => {
    const user = renderPerfil();
    await waitFor(() => expect(games.list).toHaveBeenCalled());

    const d = await abrir(user);

    expect(await within(d).findByText(/seus 3 jogos e as capas deles/)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(confirmar()).toBeDisabled();
    const senha = within(d).getByLabelText('Senha');
    expect(senha).toHaveAttribute('autocomplete', 'current-password');
    expect(within(d).getByRole('button', { name: 'Mostrar senha' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.type(senha, 'x');
    expect(confirmar()).toBeEnabled();
    await user.clear(senha);
    expect(confirmar()).toBeDisabled();
  });

  it('Cancelar fecha sem nenhuma request', async () => {
    const user = renderPerfil();
    const d = await abrir(user);

    await user.type(within(d).getByLabelText('Senha'), 'segredo-forte');
    await user.click(within(d).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog', { name: 'Excluir conta' })).not.toBeInTheDocument();
    expect(api.excluirConta).not.toHaveBeenCalled();
  });

  it('senha errada: a mensagem vem do fields.senha, sob o campo; o diálogo continua e a sessão também', async () => {
    api.excluirConta.mockRejectedValue(
      httpError(400, 'AUTH_SENHA_ATUAL_INCORRETA', { senha: 'Senha atual incorreta.' }),
    );
    const user = renderPerfil();
    const d = await abrir(user);

    await user.type(within(d).getByLabelText('Senha'), 'nao-e-esta');
    await user.click(confirmar());

    await waitFor(() =>
      expect(within(d).getByLabelText('Senha')).toHaveAccessibleDescription(
        /Senha atual incorreta\./,
      ),
    );
    expect(api.excluirConta).toHaveBeenCalledWith({ senha: 'nao-e-esta' });
    expect(getSession().status).toBe('autenticado');
  });

  it('LIMITE_TENTATIVAS (sem fields): mensagem geral pelo code, nunca a message da API', async () => {
    api.excluirConta.mockRejectedValue(httpError(429, 'LIMITE_TENTATIVAS'));
    const user = renderPerfil();
    const d = await abrir(user);

    await user.type(within(d).getByLabelText('Senha'), 'segredo-forte');
    await user.click(confirmar());

    expect(
      await within(d).findByText('Muitas tentativas. Aguarde um pouco e tente de novo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('não usar')).not.toBeInTheDocument();
  });

  it('sem conexão: "Sem conexão. Nada foi excluído.", o diálogo continua aberto e a sessão também (CA-30)', async () => {
    api.excluirConta.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderPerfil();
    const d = await abrir(user);

    await user.type(within(d).getByLabelText('Senha'), 'segredo-forte');
    await user.click(confirmar());

    expect(await within(d).findByText(SEM_CONEXAO_NADA_EXCLUIDO)).toBeInTheDocument();
    expect(dialogo()).toBeInTheDocument();
    expect(getSession().status).toBe('autenticado');
    expect(getAccessToken()).toBe('token-da-ana');
    expect(screen.getByTestId('onde')).toHaveTextContent('/perfil');
  });
});

describe('sucesso (perfil CA-28)', () => {
  it('logout local, avisa as outras abas, some só a entrada da Ana das prefs e vai a /login?motivo=conta-excluida', async () => {
    api.excluirConta.mockResolvedValue(undefined);
    storage.set(PREFS, {
      ultimoUsuario: 'u-bia',
      porUsuario: { 'u-bia': { ...PREFS_PADRAO, destaque: 'azul' } },
    });
    definirUsuario(ANA_ID);
    alterarPrefs({ destaque: 'violeta' });
    const outraAba = new BroadcastChannel(AUTH_CHANNEL);
    const recebidas: unknown[] = [];
    outraAba.onmessage = (event: MessageEvent) => recebidas.push(event.data);

    const user = renderPerfil();
    await waitFor(() => expect(games.list).toHaveBeenCalledTimes(1));
    const d = await abrir(user);
    await user.type(within(d).getByLabelText('Senha'), 'segredo-forte');
    await user.click(confirmar());

    await waitFor(() =>
      expect(screen.getByTestId('onde')).toHaveTextContent('/login?motivo=conta-excluida'),
    );
    expect(screen.getByText('Sua conta foi excluída.')).toHaveAttribute('role', 'status');
    // "Sua sessão terminou" (o aviso de um 401) nunca aparece.
    expect(screen.queryByText(/sessão terminou/i)).not.toBeInTheDocument();
    expect(getSession()).toEqual({ status: 'visitante', usuario: null, saida: 'conta-excluida' });
    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(['games'])).toBeUndefined();
    // Nenhuma request depois da exclusão: nem a lista de novo, nem refresh ou me.
    expect(games.list).toHaveBeenCalledTimes(1);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.me).not.toHaveBeenCalled();
    // A Ana era a última a usar o aparelho: ninguém fica apontado para a conta excluída.
    expect(storage.get(PREFS)).toEqual({
      ultimoUsuario: null,
      porUsuario: { 'u-bia': { ...PREFS_PADRAO, destaque: 'azul' } },
    });
    expect(document.documentElement.dataset.destaque).toBe('magenta');
    await waitFor(() => expect(recebidas).toEqual([{ type: 'logout' }]));
    outraAba.close();
  });
});
