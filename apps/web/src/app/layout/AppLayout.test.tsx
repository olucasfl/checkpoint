import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { GameDetailPage } from '@/pages/GameDetailPage';
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
          { path: '/jogos/:id', element: <GameDetailPage /> },
          { path: '/perfil', element: <main>Perfil</main> },
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

/** A barra INFERIOR (a do topo, em >= 768px, tem os mesmos destinos e o mesmo nome acessível). */
const mainNav = () => {
  const nav = document.querySelector<HTMLElement>('nav.bottom-nav');
  if (!nav) {
    throw new Error('barra inferior não encontrada');
  }
  return nav;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gamesApi.list).mockResolvedValue([]);
});

afterEach(() => {
  document.getElementById('overlay-root')?.remove();
});

describe('barra inferior (CA-02)', () => {
  it('em `/`: Jogos ativo (aria-current), Adicionar e Perfil (pwa-e-mobile CA-02, autenticacao CA-36)', async () => {
    renderAt('/');
    await screen.findByText(/nenhum jogo cadastrado/i);

    const nav = mainNav();
    expect(within(nav).getByRole('link', { name: 'Jogos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
  });

  it('em `/jogos/:id`, Jogos continua ativo na barra inferior e no topo; Perfil não (avaliacao-de-jogos CA-29)', async () => {
    vi.mocked(gamesApi.list).mockResolvedValue([]);
    renderAt('/jogos/g1');
    await screen.findByRole('heading', { name: 'Jogo não encontrado' });

    for (const nav of screen.getAllByRole('navigation', { name: 'Navegação principal' })) {
      expect(within(nav).getByRole('link', { name: 'Jogos' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(nav).getByRole('link', { name: 'Perfil' })).not.toHaveAttribute('aria-current');
    }
  });

  it('o Jogos ativo em `/jogos/:id` continua levando a `/` (href)', async () => {
    vi.mocked(gamesApi.list).mockResolvedValue([]);
    renderAt('/jogos/g1');
    await screen.findByRole('heading', { name: 'Jogo não encontrado' });

    expect(within(mainNav()).getByRole('link', { name: 'Jogos' })).toHaveAttribute('href', '/');
  });

  it('em `/perfil`, só Perfil está ativo (Jogos não casa com tudo)', () => {
    renderAt('/perfil');

    expect(within(mainNav()).getByRole('link', { name: 'Perfil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(mainNav()).getByRole('link', { name: 'Jogos' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('em `/status`, Jogos não está ativo e /status não é um item (só Jogos e Perfil são links)', () => {
    renderAt('/status');

    const nav = mainNav();
    expect(within(nav).getByRole('link', { name: 'Jogos' })).not.toHaveAttribute('aria-current');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining('Jogos'), expect.stringContaining('Perfil')]);
  });

  it('o topo (>= 768px) repete os links: Jogos e Perfil (autenticacao CA-36)', () => {
    renderAt('/status');

    const navs = screen.getAllByRole('navigation', { name: 'Navegação principal' });
    expect(navs).toHaveLength(2);
    const top = navs.find((nav) => !nav.classList.contains('bottom-nav'));
    expect(
      within(top as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining('Jogos'), expect.stringContaining('Perfil')]);
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
    await waitFor(() => expect(document.querySelector('nav.bottom-nav')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Outro botão' }));
    await waitFor(() => expect(mainNav()).toBeInTheDocument());
  });

  it('um campo DENTRO do diálogo não esconde a barra (o diálogo modal já a cobre)', async () => {
    const user = renderAt('/');
    await screen.findByText(/nenhum jogo cadastrado/i);

    await user.click(within(mainNav()).getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByLabelText('Título')).toHaveFocus();
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(document.querySelector('nav.bottom-nav')).toBeInTheDocument();
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
