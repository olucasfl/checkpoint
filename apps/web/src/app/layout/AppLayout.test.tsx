import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { GamesPage } from '@/pages/GamesPage';
import { AppLayout } from './AppLayout';

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

/** Mostra a URL atual, para conferir a navegação do "Adicionar". */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/** Uma tela qualquer do app com um campo fora de diálogo (como o nome do perfil, no futuro). */
function PageWithField() {
  return (
    <main>
      <label htmlFor="campo">Campo</label>
      <input id="campo" />
      <button type="button">Outro botão</button>
    </main>
  );
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <AppLayout />
            <LocationProbe />
          </>
        ),
        children: [
          { path: '/', element: <GamesPage /> },
          { path: '/status', element: <main>Diagnóstico</main> },
          { path: '/campo', element: <PageWithField /> },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navegação principal' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gamesApi.list).mockResolvedValue([]);
});

afterEach(() => {
  document.getElementById('overlay-root')?.remove();
});

describe('barra inferior (CA-02)', () => {
  it('em `/`: Jogos ativo (aria-current), Adicionar, e nenhum item Perfil', async () => {
    renderAt('/');
    await screen.findByText(/nenhum jogo cadastrado/i);

    const nav = mainNav();
    expect(within(nav).getByRole('link', { name: 'Jogos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
    expect(within(nav).queryByText('Perfil')).not.toBeInTheDocument();
  });

  it('em `/status`, Jogos não está ativo e /status não é um item', () => {
    renderAt('/status');

    const nav = mainNav();
    expect(within(nav).getByRole('link', { name: 'Jogos' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
  });

  it('com um destino só, o topo não repete a navegação (o desktop fica como era)', () => {
    renderAt('/status');
    expect(screen.getAllByRole('navigation', { name: 'Navegação principal' })).toHaveLength(1);
  });
});

describe('"Adicionar" na barra (CA-03, CA-04)', () => {
  it('em `/` abre o formulário de novo jogo e mantém o filtro da URL', async () => {
    const user = renderAt('/?status=ZERADO');
    await screen.findByRole('group', { name: 'Filtrar por status' });

    await user.click(within(mainNav()).getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByRole('heading', { name: 'NOVO JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveFocus();
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/?status=ZERADO'),
    );
  });

  it('em `/status` navega para `/` com o formulário aberto e a URL limpa', async () => {
    const user = renderAt('/status');

    await user.click(within(mainNav()).getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByRole('heading', { name: 'NOVO JOGO' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  });
});

describe('barra some com o teclado virtual (campo fora de diálogo focado)', () => {
  it('some enquanto o campo está focado e volta quando o foco sai', async () => {
    const user = renderAt('/campo');
    expect(mainNav()).toBeInTheDocument();

    await user.click(screen.getByLabelText('Campo'));
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull(),
    );

    await user.click(screen.getByRole('button', { name: 'Outro botão' }));
    await waitFor(() => expect(mainNav()).toBeInTheDocument());
  });

  it('um campo DENTRO do diálogo não esconde a barra (o diálogo modal já a cobre)', async () => {
    const user = renderAt('/');
    await screen.findByText(/nenhum jogo cadastrado/i);

    await user.click(within(mainNav()).getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByLabelText('Título')).toHaveFocus();
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(
      screen.getByRole('navigation', { name: 'Navegação principal', hidden: true }),
    ).toBeInTheDocument();
  });
});

describe('#overlay-root (CA-15)', () => {
  it('a barra inferior é renderizada dentro do #overlay-root, fora da árvore do conteúdo', () => {
    const overlay = document.createElement('div');
    overlay.id = 'overlay-root';
    document.body.appendChild(overlay);

    renderAt('/status');

    expect(overlay).toContainElement(mainNav());
    expect(screen.getByText('Diagnóstico').closest('#overlay-root')).toBeNull();
  });
});

describe('nenhuma página importa a navegação (CA-16)', () => {
  const pages = import.meta.glob<string>(['/src/pages/**/*.tsx', '!/src/pages/**/*.test.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('as páginas não importam BottomNav, TopNav nem AppLayout', () => {
    expect(Object.keys(pages).length).toBeGreaterThan(0);
    for (const [file, source] of Object.entries(pages)) {
      expect(source, file).not.toMatch(/import[^;]*(BottomNav|TopNav|AppLayout|app\/layout)/);
    }
  });
});
