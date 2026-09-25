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

const rows = () => screen.queryAllByRole('listitem');
const titles = () =>
  rows().map((row) => within(row).getByText(/./, { selector: '.game-title' }).textContent);
const filterButton = (name: RegExp) =>
  within(screen.getByRole('group', { name: 'Filtrar por status' })).getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue(CATALOG);
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
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

  it('média como barra de 10 segmentos + número com vírgula; "—" sem média; 0 = nada preenchido (CA-23)', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');
    const row = (title: string) => rows().find((r) => within(r).queryByText(title)) as HTMLElement;
    const filled = (title: string) => row(title).querySelectorAll('[data-segment="on"]').length;

    expect(
      within(row('Hollow Knight')).getByRole('img', { name: 'Nota 8,0 de 10' }),
    ).toBeInTheDocument();
    expect(filled('Hollow Knight')).toBe(8);
    expect(row('Hollow Knight').querySelectorAll('[data-segment]')).toHaveLength(10);

    expect(within(row('Hades')).getByRole('img', { name: 'Nota 0,0 de 10' })).toBeInTheDocument();
    expect(filled('Hades')).toBe(0);
    expect(within(row('Hades')).getByText('0,0')).toBeInTheDocument();

    expect(within(row('Outer Wilds')).getByRole('img', { name: 'Sem nota' })).toHaveTextContent(
      '—',
    );
    expect(within(row('Outer Wilds')).queryByText('SEM NOTA')).not.toBeInTheDocument();
    expect(filled('Outer Wilds')).toBe(0);
  });

  it('a média decimal: 8,3 mostra "8,3" e 8 segmentos; 8,5 arredonda a barra para 9 (CA-23)', async () => {
    api.list.mockResolvedValue([
      game({ id: '1', titulo: 'Oito e três', ...comMedia(8.3) }),
      game({ id: '2', titulo: 'Oito e meio', plataforma: 'PC', ...comMedia(8.5) }),
    ]);
    renderPage();
    await screen.findByText('Oito e três');
    const row = (title: string) => rows().find((r) => within(r).queryByText(title)) as HTMLElement;
    const filled = (title: string) => row(title).querySelectorAll('[data-segment="on"]').length;

    expect(
      within(row('Oito e três')).getByRole('img', { name: 'Nota 8,3 de 10' }),
    ).toBeInTheDocument();
    expect(within(row('Oito e três')).getByText('8,3')).toBeInTheDocument();
    expect(filled('Oito e três')).toBe(8);
    expect(within(row('Oito e meio')).getByText('8,5')).toBeInTheDocument();
    expect(filled('Oito e meio')).toBe(9);
  });

  it('a média tem legenda "NOTA", estrela e "/10", para não parecer outro número', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');
    const row = rows().find((r) => within(r).queryByText('Hollow Knight')) as HTMLElement;

    expect(within(row).getByText('Nota')).toBeInTheDocument();
    expect(within(row).getByText('8,0')).toBeInTheDocument();
    expect(within(row).getByText('/10')).toBeInTheDocument();
    // O número é texto comum da fonte legível (Rajdhani), não da Orbitron dos painéis.
    expect(within(row).getByText('8,0').closest('.font-corpo')).not.toBeNull();
    expect(within(row).getByText('8,0').closest('.font-display')).toBeNull();
  });

  it('a lista mostra só a média, nunca os cinco critérios (CA-23)', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');

    for (const rotulo of ['Gameplay', 'História', 'Gráficos', 'Trilha sonora', 'Performance']) {
      expect(screen.queryByText(new RegExp(rotulo))).not.toBeInTheDocument();
    }
  });

  it('o título é um link real para /jogos/<id> (CA-24)', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');

    const link = screen.getByRole('link', { name: 'Hollow Knight' });

    expect(link).toHaveAttribute('href', '/jogos/1');
    expect(screen.getByRole('link', { name: 'Celeste' })).toHaveAttribute('href', '/jogos/2');
  });

  it('a linha inteira leva ao detalhe (o link é esticado sobre ela), e as ações ficam por cima (CA-24)', async () => {
    renderPage();
    await screen.findByText('Hollow Knight');
    const row = rows().find((r) => within(r).queryByText('Hollow Knight')) as HTMLElement;

    expect(row).toHaveClass('relative');
    expect(within(row).getByRole('link', { name: 'Hollow Knight' })).toHaveClass('after:absolute');
    expect(within(row).getByRole('link', { name: 'Hollow Knight' })).toHaveClass('after:inset-0');
    const acoes = within(row).getByRole('button', { name: 'Editar Hollow Knight' }).parentElement;
    expect(acoes).toHaveClass('z-10');
    // Botões não ficam dentro do link (nada de <a> com <button> dentro).
    expect(
      within(row).getByRole('button', { name: 'Editar Hollow Knight' }).closest('a'),
    ).toBeNull();
  });

  it('Editar e Remover abrem seus diálogos SEM navegar para o detalhe (CA-24)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Hollow Knight');

    await user.click(screen.getByRole('button', { name: 'Editar Hollow Knight' }));

    expect(await screen.findByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    // Ainda na lista: as outras linhas continuam aqui (a rota do detalhe não existe neste teste).
    expect(screen.getByText('Celeste')).toBeInTheDocument();
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

describe('sem conexão (pwa-e-mobile CA-23, CA-24)', () => {
  const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
  const OFFLINE_LIST = 'Sem conexão. Seu catálogo aparece quando a conexão voltar.';

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

    expect(await screen.findByText('Celeste')).toBeInTheDocument();
  });

  it('lista já carregada continua visível quando o refetch seguinte falha sem conexão (CA-21)', async () => {
    api.remove.mockRejectedValue(networkError());
    const user = renderPage();
    await screen.findByText('Celeste');

    // A remoção falha e o onSettled refaz a busca, que também falha: a lista não some.
    connectivity.reportUnreachable();
    api.list.mockRejectedValue(networkError());
    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    expect(
      within(screen.getByRole('list', { name: 'Jogos' })).getByText('Celeste'),
    ).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE_LIST)).not.toBeInTheDocument();
  });

  it('salvar edição sem resposta: nada salvo, diálogo aberto com os dados, botão habilitado', async () => {
    connectivity.reportUnreachable();
    api.update.mockRejectedValue(networkError());
    const user = renderPage();
    await screen.findByText('Celeste');

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
    await screen.findByText('Celeste');

    await user.click(screen.getByRole('button', { name: 'Remover Celeste' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));

    expect(await screen.findByText(OFFLINE_NOT_SAVED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'REMOVER' })).toBeEnabled();
    expect(
      within(screen.getByRole('list', { name: 'Jogos' })).getByText('Celeste'),
    ).toBeInTheDocument();
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
    expect(await screen.findByText('Hollow Knight')).toBeInTheDocument();
    expect(titles()).toEqual(['Hollow Knight']);
  });

  it('com filtro inicial diferente de Todos, "Todos" grava ?status=TODOS e mostra todos', async () => {
    comPrefs({ filtroInicial: 'JOGANDO' });
    const user = renderPage('/');
    await screen.findByText('Hollow Knight');

    await user.click(filterButton(/Todos/));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?status=TODOS'));
    expect(rows()).toHaveLength(4);
  });

  it('um link direto /?status=ZERADO é respeitado', async () => {
    comPrefs({ filtroInicial: 'JOGANDO' });
    renderPage('/?status=ZERADO');

    await screen.findByText('Celeste');
    expect(screen.getByTestId('search')).toHaveTextContent('?status=ZERADO');
    expect(titles()).toEqual(['Celeste', 'Hades']);
  });

  it('densidade Compacta: capas 40x40 e ações ainda 44x44', async () => {
    comPrefs({ densidade: 'compacta' });
    renderPage('/');

    await screen.findByText('Celeste');
    for (const row of rows()) {
      expect(row).toHaveAttribute('data-densidade', 'compacta');
      expect(row.querySelector('[data-cover]')).toHaveClass('size-10');
      for (const acao of within(row).getAllByRole('button')) {
        expect(acao).toHaveClass('size-11');
      }
    }
  });

  it('densidade padrão (Confortável): capas 52x52', async () => {
    renderPage('/');

    await screen.findByText('Celeste');
    expect(rows()[0]).toHaveAttribute('data-densidade', 'confortavel');
    expect(rows()[0]?.querySelector('[data-cover]')).toHaveClass('size-[52px]');
  });
});

describe('linha do catálogo com a Steam (spec integracao-plataformas, CA-41)', () => {
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

  it('a capa da linha é a oficial quando não há capa enviada, e a enviada quando há (CA-42)', async () => {
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

    await screen.findByText('Sem capa enviada');
    const srcs = Array.from(document.querySelectorAll('[data-cover="image"] img')).map((img) =>
      img.getAttribute('src'),
    );
    expect(srcs).toEqual([dados.capaUrl, 'https://bucket/enviada.jpg']);
  });
});
