import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { GamesPage } from './GamesPage';

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

const api = vi.mocked(gamesApi);

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Hollow Knight',
  plataforma: 'Switch',
  status: 'JOGANDO',
  nota: 8,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...overrides,
});

const CATALOG: Game[] = [
  game({ id: '1', titulo: 'Hollow Knight', status: 'JOGANDO', nota: 8 }),
  game({ id: '2', titulo: 'Celeste', plataforma: 'PC', status: 'ZERADO', nota: 9 }),
  game({ id: '3', titulo: 'Outer Wilds', plataforma: null, status: 'QUERO_JOGAR', nota: null }),
  game({ id: '4', titulo: 'Hades', plataforma: 'PC', status: 'ZERADO', nota: 0 }),
];

/** Mostra a query string atual, para conferir que o filtro vive na URL. */
function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(url = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <GamesPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

const rows = () => screen.queryAllByRole('listitem');
const titles = () =>
  rows().map((row) => within(row).getByText(/./, { selector: 'span.game-title' }).textContent);
const filterButton = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Filtrar por status' })).getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue(CATALOG);
});

describe('painéis de contagem (CA-79)', () => {
  it('mostram Zerados 02, Jogando 01, Quero jogar 01, lidos como 2, 1 e 1', async () => {
    renderPage();
    await screen.findByText('Celeste');

    const panels = screen.getByRole('region', { name: 'Contagem por status' });
    const panel = (status: string) =>
      within(panels).getByText(
        (_, el) =>
          el?.closest('[data-panel]')?.getAttribute('data-panel') === status &&
          el.getAttribute('role') === 'img',
      );

    expect(panel('ZERADO')).toHaveTextContent('02');
    expect(panel('ZERADO')).toHaveAccessibleName('2');
    expect(panel('JOGANDO')).toHaveTextContent('01');
    expect(panel('JOGANDO')).toHaveAccessibleName('1');
    expect(panel('QUERO_JOGAR')).toHaveTextContent('01');
    expect(within(panels).getByText('Zerados')).toBeInTheDocument();
    expect(within(panels).getByText('Quero jogar')).toBeInTheDocument();
  });

  it('depois de criar um jogo a lista é buscada de novo e as contagens acompanham', async () => {
    const user = renderPage();
    await screen.findByText('Celeste');
    api.create.mockResolvedValue(game({ id: '5', titulo: 'Novo' }));
    api.list.mockResolvedValue([...CATALOG, game({ id: '5', titulo: 'Novo', status: 'JOGANDO' })]);

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(await screen.findByLabelText('Título'), 'Novo');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    await user.click(screen.getByRole('button', { name: 'SALVAR' }));

    await screen.findByText('Novo');
    const jogando = document.querySelector('[data-panel="JOGANDO"] [role="img"]');
    expect(jogando).toHaveTextContent('02');
    expect(jogando).toHaveAccessibleName('2');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });
});

describe('filtro na URL (CA-45, CA-47, CA-80)', () => {
  it('sem parâmetro, "Todos" está ativo e a lista traz todos os jogos', async () => {
    renderPage();
    await screen.findByText('Celeste');

    expect(filterButton(/^Todos/)).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Hollow Knight', 'Celeste', 'Outer Wilds', 'Hades']);
  });

  it('cada filtro mostra ícone, rótulo e contagem, e só o ativo tem aria-pressed', async () => {
    renderPage();
    await screen.findByText('Celeste');

    expect(filterButton(/^Todos/)).toHaveTextContent('Todos4');
    expect(filterButton(/^Jogando/)).toHaveTextContent('Jogando1');
    expect(filterButton(/^Quero jogar/)).toHaveTextContent('Quero jogar1');
    expect(filterButton(/^Zerado/)).toHaveTextContent('Zerado2');
    expect(
      within(screen.getByRole('group', { name: 'Filtrar por status' })).getAllByRole('button', {
        pressed: true,
      }),
    ).toHaveLength(1);
  });

  it('clicar em "Zerado" põe ?status=ZERADO na URL e mostra só os zerados', async () => {
    const user = renderPage();
    await screen.findByText('Celeste');

    await user.click(filterButton(/^Zerado/));

    expect(screen.getByTestId('search')).toHaveTextContent('?status=ZERADO');
    expect(titles()).toEqual(['Celeste', 'Hades']);
    expect(filterButton(/^Zerado/)).toHaveAttribute('aria-pressed', 'true');
    // Filtrar é no cliente: continua uma única busca.
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('"Todos" volta a URL para sem parâmetro', async () => {
    const user = renderPage('/?status=ZERADO');
    await screen.findByText('Celeste');

    await user.click(filterButton(/^Todos/));

    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
    expect(titles()).toHaveLength(4);
  });

  it('carrega o filtro da URL ao abrir (sobrevive a reload)', async () => {
    renderPage('/?status=QUERO_JOGAR');
    await screen.findByText('Outer Wilds');

    expect(filterButton(/^Quero jogar/)).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Outer Wilds']);
  });

  it('status inválido na URL vira "Todos" e mostra tudo', async () => {
    renderPage('/?status=PAUSADO');
    await screen.findByText('Celeste');

    expect(filterButton(/^Todos/)).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toHaveLength(4);
  });
});

describe('estados da lista (CA-41, CA-46, CA-50)', () => {
  it('carregando: mostra o esqueleto acessível', () => {
    api.list.mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByRole('status', { name: 'Carregando jogos' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('sem nenhum jogo: "nenhum jogo cadastrado" e o botão Adicionar jogo', async () => {
    api.list.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('Nenhum jogo cadastrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar jogo' })).toBeInTheDocument();
  });

  it('filtro sem resultado: "nenhum jogo neste status"', async () => {
    api.list.mockResolvedValue([game({ status: 'JOGANDO' })]);
    renderPage('/?status=ZERADO');

    expect(await screen.findByText('Nenhum jogo neste status')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum jogo cadastrado')).not.toBeInTheDocument();
  });

  it('API fora do ar: mensagem de erro com "tentar de novo", que busca de novo', async () => {
    api.list.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderPage();

    expect(await screen.findByText('Não deu para carregar')).toBeInTheDocument();
    api.list.mockResolvedValue(CATALOG);
    await user.click(screen.getByRole('button', { name: 'TENTAR DE NOVO' }));

    expect(await screen.findByText('Celeste')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});

describe('linha do jogo (CA-72, CA-73, CA-81)', () => {
  it('sem capa: quadrado com as iniciais numa cor da paleta, sempre a mesma (CA-72)', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');

    const cover = (title: string) =>
      within(rows().find((row) => within(row).queryByText(title)) as HTMLElement).getByText(
        /^[A-Z?]{1,2}$/,
        { selector: '[data-cover="generated"]' },
      );

    expect(cover('Hollow Knight')).toHaveTextContent('HK');
    expect(cover('Celeste')).toHaveTextContent('C');
    expect(cover('Hollow Knight')).toHaveClass('bg-capa-2'); // índice 1 do hash
    expect(cover('Celeste')).toHaveClass('bg-capa-3'); // índice 2 do hash
  });

  it('com capa: mostra a imagem, e se ela falhar volta para a gerada (CA-73)', async () => {
    api.list.mockResolvedValue([game({ capaUrl: 'https://s/capas/1/a.png' })]);
    renderPage();
    await screen.findByText('Hollow Knight');

    const image = document.querySelector('[data-cover="image"] img') as HTMLImageElement;
    expect(image).toHaveAttribute('src', 'https://s/capas/1/a.png');
    expect(image).toHaveAttribute('alt', '');

    fireEvent.error(image);

    await waitFor(() => expect(document.querySelector('[data-cover="generated"]')).not.toBeNull());
    expect(document.querySelector('[data-cover="image"]')).toBeNull();
  });

  it('nota como barra de 10 segmentos + número; "SEM NOTA" quando vazia; 0 = nada preenchido (CA-81)', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');
    const row = (title: string) => rows().find((r) => within(r).queryByText(title)) as HTMLElement;
    const filled = (title: string) => row(title).querySelectorAll('[data-segment="on"]').length;

    expect(
      within(row('Hollow Knight')).getByRole('img', { name: 'Nota 8 de 10' }),
    ).toBeInTheDocument();
    expect(filled('Hollow Knight')).toBe(8);
    expect(row('Hollow Knight').querySelectorAll('[data-segment]')).toHaveLength(10);

    expect(within(row('Hades')).getByRole('img', { name: 'Nota 0 de 10' })).toBeInTheDocument();
    expect(filled('Hades')).toBe(0);
    expect(within(row('Hades')).getByText('0')).toBeInTheDocument();

    expect(within(row('Outer Wilds')).getByText('SEM NOTA')).toBeInTheDocument();
    expect(filled('Outer Wilds')).toBe(0);
  });

  it('a nota tem legenda "NOTA", estrela e "/10", para não parecer outro número', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');
    const row = rows().find((r) => within(r).queryByText('Hollow Knight')) as HTMLElement;

    expect(within(row).getByText('Nota')).toBeInTheDocument();
    expect(within(row).getByText('8')).toBeInTheDocument();
    expect(within(row).getByText('/10')).toBeInTheDocument();
    // O número é texto comum da fonte legível (Rajdhani), não da Orbitron dos painéis.
    expect(within(row).getByText('8').closest('.font-corpo')).not.toBeNull();
    expect(within(row).getByText('8').closest('.font-display')).toBeNull();
  });

  it('plataforma vazia é omitida; a preenchida aparece', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');

    expect(screen.getByText('Switch')).toBeInTheDocument();
    expect(screen.queryByText('Sem plataforma')).not.toBeInTheDocument();
  });

  it('cada linha tem Editar e Remover com aria-label, e o selo do status', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');

    expect(screen.getByRole('button', { name: 'Editar Hollow Knight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Hollow Knight' })).toBeInTheDocument();
    expect(within(rows()[2] as HTMLElement).getByText('Quero jogar')).toBeInTheDocument();
  });
});

describe('diálogos (CA-42, CA-49)', () => {
  it('Adicionar jogo abre o diálogo com o formulário vazio', async () => {
    const user = renderPage();
    await screen.findByText('Celeste');

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));

    expect(await screen.findByRole('heading', { name: 'NOVO JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });

  it('ao abrir, o foco vai para o Título e digitar um espaço NÃO fecha o diálogo (regressão)', async () => {
    // Achado na verificação real: o autoFocus do React roda com o <dialog> ainda fechado; o foco caía
    // no botão Fechar e o espaço de "Hollow Knight" o clicava.
    const user = renderPage();
    await screen.findByText('Celeste');

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    const titulo = await screen.findByLabelText('Título');
    expect(titulo).toHaveFocus();

    await user.keyboard('Hollow Knight');

    expect(titulo).toHaveValue('Hollow Knight');
    expect(document.querySelector('dialog')).toHaveAttribute('open');
  });

  it('a confirmação de remover abre com o foco em "Cancelar" (o padrão seguro)', async () => {
    const user = renderPage();
    await screen.findByText('Celeste');

    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));

    expect(await screen.findByRole('button', { name: 'CANCELAR' })).toHaveFocus();
  });

  it('Editar abre o MESMO formulário preenchido', async () => {
    const user = renderPage();
    await screen.findByText('Celeste');

    await user.click(screen.getByRole('button', { name: 'Editar Celeste' }));

    expect(await screen.findByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Celeste');
  });

  it('Remover pede confirmação: cancelar mantém o jogo; confirmar remove e atualiza a lista', async () => {
    const user = renderPage();
    await screen.findByText('Celeste');

    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'CANCELAR' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Celeste')).toBeInTheDocument();

    api.remove.mockResolvedValue(undefined);
    api.list.mockResolvedValue(CATALOG.filter((g) => g.id !== '2'));
    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));

    await waitFor(() => expect(screen.queryByText('Celeste')).not.toBeInTheDocument());
    expect(api.remove).toHaveBeenCalledWith('2');
  });
});

describe('?novo=1 abre o formulário de novo jogo (pwa-e-mobile CA-04)', () => {
  it('abre o diálogo vazio e tira só o "novo" da URL, mantendo o filtro', async () => {
    renderPage('/?status=ZERADO&novo=1');

    expect(await screen.findByRole('heading', { name: 'NOVO JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?status=ZERADO'));
    expect(screen.getByTestId('search').textContent).not.toContain('novo');
  });

  it('sem o parâmetro, o diálogo fica fechado', async () => {
    renderPage('/');
    await screen.findByText('Celeste');

    expect(screen.queryByRole('heading', { name: 'NOVO JOGO' })).not.toBeInTheDocument();
  });
});
