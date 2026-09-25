import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { type AuthResponse, type Game } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/app/layout/RequireAuth';
import { gamesApi } from '@/features/games/api/games-api';
import { GamesPage } from '@/pages/GamesPage';
import { queryClient } from '@/shared/lib/query-client';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { entrar, resetSessionForTests, sair } from './session';

vi.mock('../api/auth-api', () => ({
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

const games = vi.mocked(gamesApi);
const auth = vi.mocked(authApi);

const sessao = (id: string, nome: string, email: string): AuthResponse => ({
  accessToken: `token-${id}`,
  usuario: { id, nome, email, criadoEm: '2026-09-24T12:00:00.000Z' },
});
const ANA = sessao('ana', 'Ana Teste', 'ana@exemplo.com');
const BIA = sessao('bia', 'Bia Teste', 'bia@exemplo.com');

const JOGO_DA_ANA: Game = {
  id: 'g-ana',
  titulo: 'Jogo Secreto da Ana',
  plataforma: 'PC',
  status: 'ZERADO',
  notas: { gameplay: 9, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: 9,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-24T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-24T12:00:00.000Z',
};

/** Faz o que o `LoginForm` faz depois do login da Bia: `entrar()` e volta para a lista. */
function LoginStub() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        entrar(BIA);
        void navigate('/');
      }}
    >
      Entrar como Bia
    </button>
  );
}

/**
 * O app como ele é na mesma aba: o `queryClient` de verdade (o mesmo do `providers.tsx`), a sessão de
 * verdade e a lista atrás do `RequireAuth`. Só as duas APIs são falsas.
 */
function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<GamesPage />} />
          </Route>
          <Route path="/login" element={<LoginStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  storage.clearScope('usuario');
  queryClient.clear();
});

afterEach(() => {
  queryClient.clear();
});

describe('troca de usuário na mesma aba (CA-47)', () => {
  it('sair da Ana e entrar como Bia: a lista da Ana nunca é pintada, a primeira pintura é o carregando', async () => {
    games.list.mockResolvedValueOnce([JOGO_DA_ANA]);
    act(() => entrar(ANA));
    const { container } = renderApp();
    expect(await screen.findByText(JOGO_DA_ANA.titulo)).toBeInTheDocument();

    // Daqui em diante, todo estado do DOM é conferido: nenhum pode ter o jogo da Ana.
    const pintados: string[] = [];
    const observer = new MutationObserver(() => pintados.push(container.textContent ?? ''));
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    auth.logout.mockResolvedValue(undefined);
    await act(async () => {
      await sair();
    });
    expect(screen.getByRole('button', { name: 'Entrar como Bia' })).toBeInTheDocument();
    expect(queryClient.getQueryData(['games'])).toBeUndefined();

    // A lista da Bia ainda não respondeu: o que aparece é o carregando, nunca o cache da Ana.
    games.list.mockReturnValue(new Promise(() => undefined));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar como Bia' }));
    });

    expect(screen.getByRole('status', { name: 'Carregando jogos' })).toBeInTheDocument();
    expect(screen.queryByText(JOGO_DA_ANA.titulo)).not.toBeInTheDocument();
    expect(games.list).toHaveBeenCalledTimes(2);

    observer.disconnect();
    // O observer viu a saída (login) e a volta (carregando): ele estava olhando, e nada tinha a Ana.
    expect(pintados.some((texto) => texto.includes('Entrar como Bia'))).toBe(true);
    expect(pintados.filter((texto) => texto.includes(JOGO_DA_ANA.titulo))).toEqual([]);
  });

  it('entrar como outra pessoa com o cache ainda cheio (sem sair antes) também começa vazio', () => {
    queryClient.setQueryData(['games'], [JOGO_DA_ANA]);

    act(() => entrar(BIA));

    expect(queryClient.getQueryData(['games'])).toBeUndefined();
  });
});
