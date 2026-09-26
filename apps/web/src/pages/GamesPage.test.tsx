import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { integracoesApi } from '@/features/integracoes/api/integracoes-api';
import { OFFLINE_NOT_SAVED } from '@/features/games/lib/api-error';
import { connectivity } from '@/shared/lib/connectivity';
import { alterarPrefs, definirUsuario, resetPrefsForTests } from '@/shared/lib/prefs/prefs-store';
import { storage } from '@/shared/lib/storage/storage';
import { GamesPage } from './GamesPage';

// Sem conta Steam nestes testes: a API de integrações não vai à rede.
vi.mock('@/features/integracoes/api/integracoes-api', () => ({
  integracoesApi: { listarContas: vi.fn().mockResolvedValue([]), detalheDoJogo: vi.fn() },
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

const api = vi.mocked(gamesApi);

/** Um jogo cuja nota geral (a média) é `media`: a nota vem só do gameplay, para a média ser exata. */
const comMedia = (media: number | null): Pick<Game, 'notas' | 'notaMedia'> => ({
  notas: { gameplay: media, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: media,
});

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Hollow Knight',
  plataforma: 'Switch',
  status: 'JOGANDO',
  ...comMedia(8),
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...overrides,
});

const CATALOG: Game[] = [
  game({ id: '1', titulo: 'Hollow Knight', status: 'JOGANDO', ...comMedia(8) }),
  game({ id: '2', titulo: 'Celeste', plataforma: 'PC', status: 'ZERADO', ...comMedia(9) }),
  game({
    id: '3',
    titulo: 'Outer Wilds',
    plataforma: null,
    status: 'QUERO_JOGAR',
    ...comMedia(null),
  }),
  game({ id: '4', titulo: 'Hades', plataforma: 'PC', status: 'ZERADO', ...comMedia(0) }),
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

const tiles = () => Array.from(document.querySelectorAll<HTMLElement>('[data-tile]'));
const titles = () => tiles().map((t) => within(t).getByRole('link').textContent);
const tile = (titulo: string) =>
  tiles().find((t) => within(t).queryByRole('link', { name: titulo })) as HTMLElement;
/** O jogo na estante (o link do tile): o destaque repete o título, por isso não se espera por texto. */
const aparece = (titulo: string) => screen.findByRole('link', { name: titulo });
const filterButton = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Filtrar por status' })).getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue(CATALOG);
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
});

describe('estante e contagens (CA-13, CA-14, CA-27)', () => {
  it('uma prateleira por status, na ordem da tela, cada uma com sua contagem e sua lista', async () => {
    renderPage();
    await aparece('Celeste');

    const nomes = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    // O primeiro h2 é o título do destaque (Hollow Knight).
    expect(nomes).toEqual(['Hollow Knight', 'Jogando agora', 'Quero jogar', 'Zerados']);
    expect(titles()).toEqual(['Hollow Knight', 'Outer Wilds', 'Celeste', 'Hades']);
    const zerados = screen.getByRole('list', { name: 'Zerados' });
    expect(
      within(zerados)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Celeste', 'Hades']);
    expect(
      within(screen.getByRole('region', { name: 'Zerados' })).getByText('2'),
    ).toBeInTheDocument();
  });

  it('não há mais os painéis de contagem', async () => {
    renderPage();
    await aparece('Celeste');

    expect(screen.queryByRole('region', { name: 'Contagem por status' })).toBeNull();
    expect(document.querySelector('[data-panel]')).toBeNull();
    expect(screen.queryByText(/Última atualização primeiro/)).toBeNull();
  });

  it('depois de criar um jogo a lista é buscada de novo e a prateleira acompanha', async () => {
    const user = renderPage();
    await aparece('Celeste');
    api.create.mockResolvedValue(game({ id: '5', titulo: 'Novo' }));
    api.list.mockResolvedValue([...CATALOG, game({ id: '5', titulo: 'Novo', status: 'JOGANDO' })]);

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(await screen.findByLabelText('Título'), 'Novo');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    await user.click(screen.getByRole('button', { name: 'SALVAR' }));

    await aparece('Novo');
    expect(
      within(screen.getByRole('list', { name: 'Jogando agora' })).getAllByRole('link'),
    ).toHaveLength(2);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });
});

describe('destaque "Continue de onde parou" (CA-22, CA-23)', () => {
  it('Todos e Jogando mostram o jogo Jogando mais recente, que continua na prateleira', async () => {
    renderPage();
    await aparece('Celeste');

    const destaque = document.querySelector('[data-destaque-catalogo]') as HTMLElement;
    expect(within(destaque).getByRole('heading', { name: 'Hollow Knight' })).toBeInTheDocument();
    expect(within(destaque).getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute(
      'href',
      '/jogos/1',
    );
    expect(titles()).toContain('Hollow Knight');
  });

  it.each(['QUERO_JOGAR', 'ZERADO'])('com o filtro %s não há destaque', async (status) => {
    renderPage(`/?status=${status}`);
    await aparece(status === 'ZERADO' ? 'Celeste' : 'Outer Wilds');

    expect(document.querySelector('[data-destaque-catalogo]')).toBeNull();
  });

  it('sem nenhum jogo Jogando, não há destaque', async () => {
    api.list.mockResolvedValue(CATALOG.filter((g) => g.status !== 'JOGANDO'));
    renderPage();
    await aparece('Celeste');

    expect(document.querySelector('[data-destaque-catalogo]')).toBeNull();
  });
});

describe('destaque e contagens acompanham a edição, sem recarregar (CA-19, CA-29)', () => {
  const alfa = game({ id: '1', titulo: 'Alfa', atualizadoEm: '2026-09-25T10:00:00.000Z' });
  const beta = game({ id: '2', titulo: 'Beta', atualizadoEm: '2026-09-24T10:00:00.000Z' });
  const gama = game({
    id: '3',
    titulo: 'Gama',
    status: 'ZERADO',
    atualizadoEm: '2026-09-23T10:00:00.000Z',
  });
  const dois = [alfa, beta, gama];
  const destaqueTitulo = () =>
    within(document.querySelector('[data-destaque-catalogo]') as HTMLElement).getByRole('heading')
      .textContent;

  it('editar outro jogo Jogando promove ele a destaque', async () => {
    api.list.mockResolvedValue(dois);
    const user = renderPage();
    await aparece('Gama');
    expect(destaqueTitulo()).toBe('Alfa');

    const editado = { ...beta, atualizadoEm: '2026-09-25T11:00:00.000Z' };
    api.update.mockResolvedValue(editado);
    api.list.mockResolvedValue([editado, alfa, gama]);
    await user.click(screen.getByRole('button', { name: 'Editar Beta' }));
    await user.click(await screen.findByRole('button', { name: 'SALVAR' }));

    await waitFor(() => expect(destaqueTitulo()).toBe('Beta'));
  });

  it('as pílulas e os contadores das prateleiras sobem, mudam e descem com criar, editar e remover', async () => {
    api.list.mockResolvedValue(dois);
    const user = renderPage();
    await aparece('Gama');
    const contador = (nome: string) =>
      within(screen.getByRole('region', { name: nome })).getAllByText(/^\d+$/)[0]?.textContent;
    expect(filterButton(/^Todos ?3$/)).toBeInTheDocument();
    expect(filterButton(/^Jogando ?2$/)).toBeInTheDocument();
    expect(filterButton(/^Quero jogar ?0$/)).toBeInTheDocument();
    expect(filterButton(/^Zerado ?1$/)).toBeInTheDocument();
    expect([contador('Jogando agora'), contador('Zerados')]).toEqual(['2', '1']);
    expect(screen.queryByRole('region', { name: 'Quero jogar' })).toBeNull();

    // criar um Jogando
    const novo = game({ id: '4', titulo: 'Delta', atualizadoEm: '2026-09-25T12:00:00.000Z' });
    api.create.mockResolvedValue(novo);
    api.list.mockResolvedValue([novo, ...dois]);
    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    await user.type(await screen.findByLabelText('Título'), 'Delta');
    await user.click(screen.getByRole('button', { name: 'SALVAR' }));
    await waitFor(() => expect(filterButton(/^Todos ?4$/)).toBeInTheDocument());
    expect(filterButton(/^Jogando ?3$/)).toBeInTheDocument();
    expect(contador('Jogando agora')).toBe('3');

    // remover um Zerado
    api.remove.mockResolvedValue(undefined);
    api.list.mockResolvedValue([novo, alfa, beta]);
    await user.click(screen.getByRole('button', { name: 'Remover Gama' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));
    await waitFor(() => expect(filterButton(/^Zerado ?0$/)).toBeInTheDocument());
    expect(filterButton(/^Todos ?3$/)).toBeInTheDocument();
  });

  it('com o filtro Zerado só a prateleira "Zerados" aparece', async () => {
    api.list.mockResolvedValue(dois);
    renderPage('/?status=ZERADO');
    await aparece('Gama');

    expect(screen.getAllByRole('region').map((r) => r.getAttribute('data-prateleira'))).toEqual([
      'ZERADO',
    ]);
  });
});

describe('"Adicionar" ao fim da prateleira (CA-14)', () => {
  it('abre o formulário de novo jogo já no status da prateleira', async () => {
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Adicionar em Zerados' }));

    expect(await screen.findByRole('heading', { name: 'NOVO JOGO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zerado' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o "Adicionar jogo" do topo mantém o status padrão', async () => {
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));

    await screen.findByRole('heading', { name: 'NOVO JOGO' });
    expect(screen.getByRole('button', { name: 'Quero jogar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('barra superior do catálogo (CA-12)', () => {
  it('logo como link "/" da página atual e o Perfil como link redondo com nome acessível', async () => {
    renderPage();
    await aparece('Celeste');

    expect(screen.getByRole('link', { name: 'checkpoint' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seus jogos');
  });

  it('o logo tem alvo de 44 px e, sem espaço, quem rola são os filtros (o Perfil não encolhe)', async () => {
    renderPage();
    await aparece('Celeste');

    expect(screen.getByRole('link', { name: 'checkpoint' })).toHaveClass('min-h-11', 'shrink-0');
    expect(screen.getByRole('link', { name: 'Perfil' }).parentElement).toHaveClass('shrink-0');
    expect(screen.getByRole('group', { name: 'Filtrar por status' })).toHaveClass(
      'overflow-x-auto',
      'md:min-w-0',
    );
  });
});

describe('filtro na URL (CA-45, CA-47, CA-80)', () => {
  it('sem parâmetro, "Todos" está ativo e a estante traz todos os jogos', async () => {
    renderPage();
    await aparece('Celeste');

    expect(filterButton(/^Todos/)).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Hollow Knight', 'Outer Wilds', 'Celeste', 'Hades']);
  });

  it('cada filtro mostra ícone, rótulo e contagem, e só o ativo tem aria-pressed', async () => {
    renderPage();
    await aparece('Celeste');

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
    await aparece('Celeste');

    await user.click(filterButton(/^Zerado/));

    expect(screen.getByTestId('search')).toHaveTextContent('?status=ZERADO');
    expect(titles()).toEqual(['Celeste', 'Hades']);
    expect(filterButton(/^Zerado/)).toHaveAttribute('aria-pressed', 'true');
    // Filtrar é no cliente: continua uma única busca.
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('"Todos" volta a URL para sem parâmetro', async () => {
    const user = renderPage('/?status=ZERADO');
    await aparece('Celeste');

    await user.click(filterButton(/^Todos/));

    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
    expect(titles()).toHaveLength(4);
  });

  it('carrega o filtro da URL ao abrir (sobrevive a reload)', async () => {
    renderPage('/?status=QUERO_JOGAR');
    await aparece('Outer Wilds');

    expect(filterButton(/^Quero jogar/)).toHaveAttribute('aria-pressed', 'true');
    expect(titles()).toEqual(['Outer Wilds']);
  });

  it('status inválido na URL vira "Todos" e mostra tudo', async () => {
    renderPage('/?status=PAUSADO');
    await aparece('Celeste');

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

    expect(await aparece('Celeste')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});

describe('tile do jogo (CA-15 a CA-19)', () => {
  it('sem capa: capa em pé gerada com as iniciais numa cor da paleta, sempre a mesma', async () => {
    renderPage();
    await aparece('Hollow Knight');

    const cover = (title: string) =>
      tile(title).querySelector('[data-cover="generated"]') as HTMLElement;

    expect(cover('Hollow Knight')).toHaveTextContent('HK');
    expect(cover('Celeste')).toHaveTextContent('C');
    expect(cover('Hollow Knight')).toHaveClass('bg-capa-2'); // índice 1 do hash
    expect(cover('Celeste')).toHaveClass('bg-capa-3'); // índice 2 do hash
    expect(cover('Celeste')).toHaveClass('aspect-[3/4]');
  });

  it('com capa: mostra a imagem, e se ela falhar volta para a gerada', async () => {
    api.list.mockResolvedValue([game({ capaUrl: 'https://s/capas/1/a.png' })]);
    renderPage();
    await aparece('Hollow Knight');

    const image = document.querySelector(
      '[data-tile] [data-cover="image"] img',
    ) as HTMLImageElement;
    expect(image).toHaveAttribute('src', 'https://s/capas/1/a.png');
    expect(image).toHaveAttribute('alt', '');

    fireEvent.error(image);

    await waitFor(() => expect(document.querySelector('[data-cover="generated"]')).not.toBeNull());
    expect(document.querySelector('[data-tile] [data-cover="image"]')).toBeNull();
  });

  it('a média vira o anel com o número com vírgula; sem média, sem anel; 0 é nota', async () => {
    renderPage();
    await aparece('Hollow Knight');

    expect(
      within(tile('Hollow Knight')).getByRole('img', { name: 'Nota 8,0 de 10' }),
    ).toHaveTextContent('8,0');
    expect(within(tile('Hades')).getByRole('img', { name: 'Nota 0,0 de 10' })).toHaveTextContent(
      '0,0',
    );
    expect(within(tile('Outer Wilds')).queryByRole('img')).toBeNull();
    expect(within(tile('Outer Wilds')).queryByText('SEM NOTA')).not.toBeInTheDocument();
  });

  it('a média decimal aparece como 8,3 e 8,5 e o arco acompanha (--pct)', async () => {
    api.list.mockResolvedValue([
      game({ id: '1', titulo: 'Oito e três', ...comMedia(8.3) }),
      game({ id: '2', titulo: 'Oito e meio', plataforma: 'PC', ...comMedia(8.5) }),
    ]);
    renderPage();
    await aparece('Oito e três');

    const tres = within(tile('Oito e três')).getByRole('img', { name: 'Nota 8,3 de 10' });
    const meio = within(tile('Oito e meio')).getByRole('img', { name: 'Nota 8,5 de 10' });
    expect(tres).toHaveTextContent('8,3');
    expect(tres.style.getPropertyValue('--pct')).toBe('83');
    expect(meio.style.getPropertyValue('--pct')).toBe('85');
  });

  it('o tile mostra só a média, nunca os cinco critérios', async () => {
    renderPage();
    await aparece('Hollow Knight');

    for (const rotulo of ['Gameplay', 'História', 'Gráficos', 'Trilha sonora', 'Performance']) {
      expect(screen.queryByText(new RegExp(rotulo))).not.toBeInTheDocument();
    }
  });

  it('o título é um link real para /jogos/<id>', async () => {
    renderPage();
    await aparece('Hollow Knight');

    expect(screen.getByRole('link', { name: 'Hollow Knight' })).toHaveAttribute('href', '/jogos/1');
    expect(screen.getByRole('link', { name: 'Celeste' })).toHaveAttribute('href', '/jogos/2');
  });

  it('o tile inteiro leva ao detalhe (link esticado) e as ações ficam por cima, fora do link', async () => {
    renderPage();
    await aparece('Hollow Knight');
    const t = tile('Hollow Knight');

    expect(t).toHaveClass('relative');
    expect(within(t).getByRole('link', { name: 'Hollow Knight' })).toHaveClass(
      'after:absolute',
      'after:inset-0',
    );
    const editar = within(t).getByRole('button', { name: 'Editar Hollow Knight' });
    expect(editar.parentElement).toHaveClass('z-10', 'tile-acoes');
    expect(editar.closest('a')).toBeNull();
  });

  it('Editar abre o diálogo SEM navegar para o detalhe', async () => {
    const user = userEvent.setup();
    renderPage();
    await aparece('Hollow Knight');

    await user.click(screen.getByRole('button', { name: 'Editar Hollow Knight' }));

    expect(await screen.findByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Celeste' })).toBeInTheDocument();
  });

  it('plataforma vazia é omitida; a preenchida vira o chip da capa; "Xbox Series X|S" aparece com "/"', async () => {
    api.list.mockResolvedValue([
      game({ id: '1', titulo: 'Com plataforma', plataforma: 'Switch' }),
      game({ id: '2', titulo: 'Sem plataforma', plataforma: null }),
      game({ id: '3', titulo: 'No Xbox', plataforma: 'Xbox Series X|S' }),
    ]);
    renderPage();
    await aparece('Com plataforma');

    expect(within(tile('Com plataforma')).getByText('Switch')).toBeInTheDocument();
    expect(tile('Sem plataforma').querySelector('[data-chip-plataforma]')).toBeNull();
    expect(within(tile('No Xbox')).getByText('Xbox Series X/S')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('X|S');
  });

  it('cada tile tem Editar e Remover com aria-label e mora na prateleira do seu status', async () => {
    renderPage();
    await aparece('Hollow Knight');

    expect(screen.getByRole('button', { name: 'Editar Hollow Knight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Hollow Knight' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Quero jogar' })).getByRole('link', {
        name: 'Outer Wilds',
      }),
    ).toBeInTheDocument();
  });
});

describe('diálogos (CA-42, CA-49)', () => {
  it('Adicionar jogo abre o diálogo com o formulário vazio', async () => {
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));

    expect(await screen.findByRole('heading', { name: 'NOVO JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });

  it('ao abrir, o foco vai para o Título e digitar um espaço NÃO fecha o diálogo (regressão)', async () => {
    // Achado na verificação real: o autoFocus do React roda com o <dialog> ainda fechado; o foco caía
    // no botão Fechar e o espaço de "Hollow Knight" o clicava.
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Adicionar jogo' }));
    const titulo = await screen.findByLabelText('Título');
    expect(titulo).toHaveFocus();

    await user.keyboard('Hollow Knight');

    expect(titulo).toHaveValue('Hollow Knight');
    expect(document.querySelector('dialog')).toHaveAttribute('open');
  });

  it('a confirmação de remover abre com o foco em "Cancelar" (o padrão seguro)', async () => {
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));

    expect(await screen.findByRole('button', { name: 'CANCELAR' })).toHaveFocus();
  });

  it('Editar abre o MESMO formulário preenchido', async () => {
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Editar Celeste' }));

    expect(await screen.findByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Celeste');
  });

  it('Remover pede confirmação: cancelar mantém o jogo; confirmar remove e atualiza a lista', async () => {
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'CANCELAR' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Celeste' })).toBeInTheDocument();

    api.remove.mockResolvedValue(undefined);
    api.list.mockResolvedValue(CATALOG.filter((g) => g.id !== '2'));
    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Celeste' })).not.toBeInTheDocument(),
    );
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
    await aparece('Celeste');

    expect(screen.queryByRole('heading', { name: 'NOVO JOGO' })).not.toBeInTheDocument();
  });
});

describe('sem conexão (pwa-e-mobile CA-23, CA-24)', () => {
  const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
  const OFFLINE_LIST = 'Sem conexão. Seu catálogo aparece quando a conexão voltar.';
  const celesteNaPrateleira = () =>
    within(screen.getByRole('list', { name: 'Zerados' })).getByRole('link', { name: 'Celeste' });

  afterEach(() => {
    connectivity.reportReachable();
  });

  it.each([
    ['sem-servidor', true],
    ['offline', false],
  ])(
    'lista que falha com o estado %s: mensagem de conexão e "Tentar de novo" (CA-24)',
    async (_state, browserOnline) => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(browserOnline);
      connectivity.reportUnreachable();
      api.list.mockRejectedValue(networkError());
      renderPage();

      expect(await screen.findByText(OFFLINE_LIST)).toBeInTheDocument();
      expect(screen.queryByText('A API não respondeu.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'TENTAR DE NOVO' })).toBeEnabled();
      expect(screen.queryByRole('status', { name: 'Carregando jogos' })).not.toBeInTheDocument();
      onLine.mockRestore();
    },
  );

  it('"Tentar de novo" busca outra vez e, com resposta, mostra o catálogo', async () => {
    connectivity.reportUnreachable();
    api.list.mockRejectedValueOnce(networkError());
    const user = renderPage();
    await screen.findByText(OFFLINE_LIST);

    api.list.mockResolvedValue(CATALOG);
    await user.click(screen.getByRole('button', { name: 'TENTAR DE NOVO' }));

    expect(await aparece('Celeste')).toBeInTheDocument();
  });

  it('lista já carregada continua visível quando o refetch seguinte falha sem conexão (CA-21)', async () => {
    api.remove.mockRejectedValue(networkError());
    const user = renderPage();
    await aparece('Celeste');

    // A remoção falha e o onSettled refaz a busca, que também falha: a lista não some.
    connectivity.reportUnreachable();
    api.list.mockRejectedValue(networkError());
    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    expect(celesteNaPrateleira()).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE_LIST)).not.toBeInTheDocument();
  });

  it('salvar edição sem resposta: nada salvo, diálogo aberto com os dados, botão habilitado', async () => {
    connectivity.reportUnreachable();
    api.update.mockRejectedValue(networkError());
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Editar Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'SALVAR' }));

    expect(await screen.findByText(OFFLINE_NOT_SAVED)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Celeste');
    expect(screen.getByRole('button', { name: 'SALVAR' })).toBeEnabled();
  });

  it('remover sem resposta: mesma mensagem, confirmação aberta e o jogo continua na lista', async () => {
    connectivity.reportUnreachable();
    api.remove.mockRejectedValue(networkError());
    const user = renderPage();
    await aparece('Celeste');

    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));

    expect(await screen.findByText(OFFLINE_NOT_SAVED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'REMOVER' })).toBeEnabled();
    expect(celesteNaPrateleira()).toBeInTheDocument();
  });
});

describe('preferências do /perfil no catálogo (perfil CA-16, CA-17)', () => {
  function comPrefs(parcial: Parameters<typeof alterarPrefs>[0]) {
    definirUsuario('u1');
    alterarPrefs(parcial);
  }

  it('filtro inicial Jogando: "/" vira "/?status=JOGANDO" e só aparecem os jogando', async () => {
    comPrefs({ filtroInicial: 'JOGANDO' });
    renderPage('/');

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?status=JOGANDO'));
    expect(await aparece('Hollow Knight')).toBeInTheDocument();
    expect(titles()).toEqual(['Hollow Knight']);
  });

  it('com filtro inicial diferente de Todos, "Todos" grava ?status=TODOS e mostra todos', async () => {
    comPrefs({ filtroInicial: 'JOGANDO' });
    const user = renderPage('/');
    await aparece('Hollow Knight');

    await user.click(filterButton(/Todos/));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?status=TODOS'));
    expect(tiles()).toHaveLength(4);
  });

  it('um link direto /?status=ZERADO é respeitado', async () => {
    comPrefs({ filtroInicial: 'JOGANDO' });
    renderPage('/?status=ZERADO');

    await aparece('Celeste');
    expect(screen.getByTestId('search')).toHaveTextContent('?status=ZERADO');
    expect(titles()).toEqual(['Celeste', 'Hades']);
  });

  it('densidade Compacta: capas 120 (108 no celular) e ações ainda 44x44', async () => {
    comPrefs({ densidade: 'compacta' });
    renderPage('/');

    await aparece('Celeste');
    for (const t of tiles()) {
      expect(t).toHaveClass('w-[108px]', 'md:w-[120px]');
      for (const acao of within(t).getAllByRole('button')) {
        expect(acao).toHaveClass('size-11');
      }
    }
  });

  it('densidade padrão (Confortável): capas 132 (150 no desktop)', async () => {
    renderPage('/');

    await aparece('Celeste');
    expect(tiles()[0]).toHaveClass('w-[132px]', 'md:w-[150px]');
  });
});

describe('tile do catálogo com a Steam (spec integracao-plataformas, CA-41)', () => {
  const dados = {
    provedor: 'STEAM' as const,
    idExterno: '504230',
    minutosJogados: 2550,
    ultimaVezJogadoEm: null,
    conquistasTotal: 40,
    conquistasDesbloqueadas: 12,
    capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg',
    atualizadoEm: '2026-09-25T12:00:00.000Z',
  };

  it('o jogo ligado mostra "42 h · 12/40" e o sem ligação não mostra nada; abrir "/" NÃO consulta conquistas', async () => {
    api.list.mockResolvedValue([
      game({ id: 'a', titulo: 'Ligado', dadosPlataforma: [dados] }),
      game({ id: 'b', titulo: 'Solto', dadosPlataforma: [] }),
    ]);
    renderPage();

    const resumo = await screen.findByRole('img', {
      name: 'Tempo jogado na Steam: 42 horas, 12 de 40 conquistas',
    });
    expect(resumo).toHaveTextContent('42 h · 12/40');
    expect(document.querySelectorAll('[data-steam-resumo]')).toHaveLength(1);
    expect(integracoesApi.detalheDoJogo).not.toHaveBeenCalled();
  });

  it('a capa do tile é a oficial quando não há capa enviada, e a enviada quando há (CA-42)', async () => {
    api.list.mockResolvedValue([
      game({ id: 'a', titulo: 'Sem capa enviada', dadosPlataforma: [dados] }),
      game({
        id: 'b',
        titulo: 'Com capa enviada',
        capaUrl: 'https://bucket/enviada.jpg',
        dadosPlataforma: [dados],
      }),
    ]);
    renderPage();

    await aparece('Sem capa enviada');
    const srcs = Array.from(document.querySelectorAll('[data-tile] [data-cover="image"] img')).map(
      (img) => img.getAttribute('src'),
    );
    expect(srcs).toEqual([dados.capaUrl, 'https://bucket/enviada.jpg']);
  });
});
