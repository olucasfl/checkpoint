import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { integracoesApi } from '@/features/integracoes/api/integracoes-api';
import { GameDetailPage } from '@/pages/GameDetailPage';
import { GamesPage } from '@/pages/GamesPage';
import { biblioteca, conta, detalheSteam, jogosFeios, jogosSinteticos } from './api-fixtures';

/**
 * Regressão do relato "qualquer clique quebra contra a API real": renderiza as telas com o que um catálogo de produção
 * tem e o mock feliz nunca tinha (título com HTML, plataforma fora da lista, capa que dá 404, Steam com nulos, 60
 * jogos) e com as respostas de ERRO reais da API (409, 502). Falha em qualquer `console.error` (chave duplicada,
 * erro de render, aviso do React) ou tela em branco.
 */
vi.mock('@/features/integracoes/api/integracoes-api', () => ({
  integracoesApi: {
    listarContas: vi.fn(),
    biblioteca: vi.fn(),
    detalheDoJogo: vi.fn(),
    desvincularJogo: vi.fn(),
    vincularJogo: vi.fn(),
    atualizarJogo: vi.fn(),
  },
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
const integ = vi.mocked(integracoesApi);
let consoleError: ReturnType<typeof vi.spyOn>;

function httpError(status: number, body: Record<string, unknown>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    data: { statusCode: status, ...body },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function renderRotas(entrada: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <GamesPage /> },
      { path: '/jogos/:id', element: <GameDetailPage /> },
      { path: '/perfil', element: <main>Perfil</main> },
    ],
    { initialEntries: [entrada] },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, user: userEvent.setup({ applyAccept: false }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  integ.listarContas.mockResolvedValue([conta]);
  integ.biblioteca.mockResolvedValue(biblioteca());
  integ.detalheDoJogo.mockResolvedValue(detalheSteam());
});
afterEach(() => {
  expect(consoleError.mock.calls.map((c: unknown[]) => String(c[0]).slice(0, 200))).toEqual([]);
  consoleError.mockRestore();
});

describe('catálogo com dados de produção', () => {
  it('60 jogos, título com HTML e plataforma fora da lista: renderiza, conta certo e o HTML fica como texto', async () => {
    const lista = jogosFeios();
    games.list.mockResolvedValue(lista);
    const { container } = renderRotas('/');

    expect(
      await screen.findByRole('link', { name: /<script>alert\(1\)<\/script>/ }),
    ).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    const todos = screen.getByRole('button', { name: new RegExp(`^Todos ?${lista.length}$`) });
    expect(todos).toHaveAttribute('aria-pressed', 'true');
    // dois jogos com o mesmo título e plataformas diferentes convivem (chave por id, sem aviso de chave duplicada)
    expect(screen.getAllByRole('link', { name: 'Mesmo título' })).toHaveLength(2);
    expect(document.querySelectorAll('[data-tile]').length).toBe(lista.length);
  });

  it('a imagem de capa que dá 404 cai para a capa gerada, sem quebrar a estante', async () => {
    games.list.mockResolvedValue(jogosFeios());
    const { container } = renderRotas('/');
    await screen.findByRole('link', { name: /<script>/ });

    const imagem = container.querySelector('[data-tile] img');
    expect(imagem).not.toBeNull();
    imagem?.dispatchEvent(new Event('error'));
    await waitFor(() => expect(container.querySelector('[data-tile] img')).toBeNull());
  });

  it('clicar em cada tile (o link real) leva ao detalhe daquele jogo, sem erro', async () => {
    const lista = jogosSinteticos();
    games.list.mockResolvedValue(lista);
    const { user, router } = renderRotas('/');

    for (const jogo of lista) {
      await user.click(await screen.findByRole('link', { name: jogo.titulo }));
      expect(router.state.location.pathname).toBe(`/jogos/${jogo.id}`);
      expect(
        await screen.findByRole('heading', { level: 1, name: jogo.titulo }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Voltar' }));
      await router.navigate('/');
    }
  });
});

describe('detalhe de cada jogo "feio"', () => {
  it.each([0, 1, 2, 5, 6, 7])(
    'o jogo %i abre, mostra o título como texto e o Editar abre e fecha o formulário',
    async (indice) => {
      const lista = jogosFeios();
      const alvo = lista[indice] as Game;
      games.list.mockResolvedValue(lista);
      const { user } = renderRotas(`/jogos/${alvo.id}`);

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(alvo.titulo);
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      const dialogo = await screen.findByRole('dialog');
      expect(within(dialogo).getByRole('heading', { name: 'Editar jogo' })).toBeInTheDocument();
      await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Editar jogo' })).toBeNull(),
      );
    },
  );

  it('Steam com total de conquistas 0 ou nulo: sem barra quebrada e sem NaN', async () => {
    const lista = jogosFeios();
    games.list.mockResolvedValue(lista);
    for (const indice of [1, 2]) {
      const alvo = lista[indice] as Game;
      integ.detalheDoJogo.mockResolvedValue(
        detalheSteam({ dados: alvo.dadosPlataforma[0], conquistas: [], aviso: 'SEM_CONQUISTAS' }),
      );
      const { unmount } = renderRotasComLimpeza(`/jogos/${alvo.id}`);
      await screen.findByRole('heading', { level: 2, name: 'Steam' });
      expect(document.body.textContent).not.toMatch(/NaN|undefined|Invalid Date/);
      unmount();
    }
  });
});

function renderRotasComLimpeza(entrada: string) {
  const r = renderRotas(entrada);
  return { ...r, unmount: () => document.body.replaceChildren() };
}

describe('respostas de erro reais da API', () => {
  it('502 PLATAFORMA_INDISPONIVEL no detalhe da Steam: o jogo continua na tela com o último valor e um aviso', async () => {
    const lista = jogosSinteticos();
    games.list.mockResolvedValue(lista);
    integ.detalheDoJogo.mockRejectedValue(
      httpError(502, { code: 'PLATAFORMA_INDISPONIVEL', message: 'Steam fora do ar' }),
    );
    renderRotas(`/jogos/${lista[0]?.id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hollow Knight' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Não foi possível carregar as conquistas agora/),
    ).toBeInTheDocument();
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
  });

  it('409 de título duplicado ao salvar: a mensagem aparece no campo e o formulário segue aberto', async () => {
    const lista = jogosSinteticos();
    games.list.mockResolvedValue(lista);
    games.update.mockRejectedValue(
      httpError(409, {
        message: 'Já existe esse jogo nesta plataforma',
        fields: { titulo: 'Já existe esse jogo nesta plataforma' },
      }),
    );
    const { user } = renderRotas(`/jogos/${lista[0]?.id}`);
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(await screen.findByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe esse jogo nesta plataforma')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editar jogo' })).toBeInTheDocument();
  });

  it('500 na lista: o catálogo mostra o erro com "Tentar de novo" e volta quando a API responde', async () => {
    games.list.mockRejectedValueOnce(httpError(500, { message: 'x' }));
    games.list.mockResolvedValue(jogosSinteticos());
    const { user } = renderRotas('/');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: 'Hollow Knight' })).toBeInTheDocument();
  });
});
