import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { GameDetailPage } from './GameDetailPage';

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

const SEM_NOTAS = {
  gameplay: null,
  historia: null,
  graficos: null,
  trilhaSonora: null,
  performance: null,
};

/** O Celeste do critério da spec: Gameplay 9,2, História 8 e os outros três vazios (média 8,6). */
const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Celeste',
  plataforma: 'PC',
  status: 'ZERADO',
  notas: { ...SEM_NOTAS, gameplay: 9.2, historia: 8 },
  notaMedia: 8.6,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...overrides,
});

function httpError(status: number): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, message: 'x' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function Onde() {
  const { pathname, search } = useLocation();
  return <output data-testid="onde">{`${pathname}${search}`}</output>;
}

function renderAt(entries: string[] = ['/jogos/g1'], index = entries.length - 1) {
  const router = createMemoryRouter(
    [
      { path: '/jogos/:id', element: <GameDetailPage /> },
      { path: '/', element: <main>Catálogo</main> },
    ].map((route) => ({
      ...route,
      element: (
        <>
          {route.element}
          <Onde />
        </>
      ),
    })),
    { initialEntries: entries, initialIndex: index },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

const onde = () => screen.getByTestId('onde').textContent;
const criterio = (chave: string) =>
  document.querySelector(`[data-criterio="${chave}"]`) as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue([game()]);
});

describe('conteúdo (CA-25)', () => {
  it('título, plataforma, status e a média em destaque', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { level: 1, name: 'Celeste' })).toBeInTheDocument();
    expect(screen.getByText('PC')).toBeInTheDocument();
    expect(screen.getByText('Zerado')).toBeInTheDocument();
    const media = screen.getByRole('region', { name: 'Nota geral' });
    expect(within(media).getByRole('img', { name: 'Nota 8,6 de 10' })).toBeInTheDocument();
    expect(within(media).getByText('8,6')).toHaveClass('md:text-[56px]');
  });

  it('os cinco critérios, na ordem: nota e barra, ou "sem nota" quando vazio', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    const lista = screen.getByRole('list', { name: 'Notas por critério' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(5);
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-criterio')),
    ).toEqual(['gameplay', 'historia', 'graficos', 'trilhaSonora', 'performance']);

    expect(
      within(criterio('gameplay')).getByRole('img', { name: 'Gameplay 9,2 de 10' }),
    ).toBeInTheDocument();
    expect(within(criterio('gameplay')).getByText('9,2')).toBeInTheDocument();
    expect(criterio('gameplay').querySelectorAll('[data-segment="on"]')).toHaveLength(9);
    expect(
      within(criterio('historia')).getByRole('img', { name: 'História 8,0 de 10' }),
    ).toBeInTheDocument();
    expect(within(criterio('historia')).getByText('8,0')).toBeInTheDocument();

    for (const chave of ['graficos', 'trilhaSonora', 'performance']) {
      expect(within(criterio(chave)).getByText(/sem nota/i)).toBeInTheDocument();
      expect(within(criterio(chave)).queryByRole('img')).not.toBeInTheDocument();
    }
  });

  it('cada critério mostra o rótulo e a descrição curta da spec', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    expect(within(criterio('trilhaSonora')).getByText('Trilha sonora')).toBeInTheDocument();
    expect(
      within(criterio('trilhaSonora')).getByText('Música, efeitos sonoros e dublagem.'),
    ).toBeInTheDocument();
    expect(within(criterio('performance')).getByText('Performance técnica')).toBeInTheDocument();
  });

  it('sem nenhuma nota, a média mostra "sem nota" e explica de onde ela vem', async () => {
    api.list.mockResolvedValue([game({ notas: SEM_NOTAS, notaMedia: null })]);
    renderAt();

    const media = await screen.findByRole('region', { name: 'Nota geral' });

    expect(within(media).getByText(/sem nota/i)).toBeInTheDocument();
    expect(within(media).getByText(/média dos critérios/i)).toBeInTheDocument();
  });

  it('uma nota 0 é uma nota: "0,0" e nenhum segmento, e não "sem nota"', async () => {
    api.list.mockResolvedValue([game({ notas: { ...SEM_NOTAS, performance: 0 }, notaMedia: 0 })]);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    expect(
      within(criterio('performance')).getByRole('img', { name: 'Performance técnica 0,0 de 10' }),
    ).toBeInTheDocument();
    expect(criterio('performance').querySelectorAll('[data-segment="on"]')).toHaveLength(0);
    expect(within(criterio('performance')).queryByText(/sem nota/i)).not.toBeInTheDocument();
  });

  it('a capa grande: a gerada (cor + iniciais) sem capa, e a imagem com capa', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });
    const gerada = document.querySelector('[data-cover="generated"]') as HTMLElement;

    expect(gerada).toHaveTextContent('C');
    expect(gerada).toHaveClass('max-w-[320px]');
    expect(gerada).toHaveClass('aspect-square');
  });

  it('com capa enviada mostra a imagem', async () => {
    api.list.mockResolvedValue([game({ capaUrl: 'https://s/capas/g1/a.png' })]);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    expect(document.querySelector('[data-cover="image"] img')).toHaveAttribute(
      'src',
      'https://s/capas/g1/a.png',
    );
  });
});

describe('descrição (CA-26)', () => {
  it('sem descrição mostra o convite "Adicionar descrição", que abre o formulário', async () => {
    const user = renderAt();

    await user.click(await screen.findByRole('button', { name: 'Adicionar descrição' }));

    expect(await screen.findByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Descrição/ })).toBeInTheDocument();
  });

  it('a descrição é TEXTO: o HTML aparece literal, sem negrito, e a quebra de linha é preservada', async () => {
    api.list.mockResolvedValue([game({ descricao: '<b>oi</b>\nlinha 2' })]);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    const secao = document.querySelector('[data-secao="descricao"]') as HTMLElement;
    const texto = secao.querySelector('p') as HTMLElement;

    expect(texto.textContent).toBe('<b>oi</b>\nlinha 2');
    expect(texto.querySelector('b')).toBeNull();
    expect(texto).toHaveClass('whitespace-pre-line');
    expect(screen.queryByRole('button', { name: 'Adicionar descrição' })).not.toBeInTheDocument();
  });

  it('um <script> na descrição não vira elemento', async () => {
    api.list.mockResolvedValue([
      game({ descricao: '<script>alert(1)</script><img src=x onerror=alert(1)>' }),
    ]);
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    const secao = document.querySelector('[data-secao="descricao"]') as HTMLElement;
    expect(secao.querySelector('script, img')).toBeNull();
    expect(secao).toHaveTextContent('<script>alert(1)</script>');
  });
});

describe('Editar, Excluir e Voltar (CA-27)', () => {
  it('Editar abre o mesmo formulário do catálogo; salvar atualiza a página sem recarregar', async () => {
    const atualizado = game({
      notas: { ...SEM_NOTAS, gameplay: 5, historia: 8 },
      notaMedia: 6.5,
    });
    api.list.mockResolvedValueOnce([game()]).mockResolvedValue([atualizado]);
    api.update.mockResolvedValue(atualizado);
    const user = renderAt();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialogo = await screen.findByRole('heading', { name: 'EDITAR JOGO' });
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByLabelText('Gameplay')).toHaveValue('9,2');
    await user.clear(screen.getByLabelText('Gameplay'));
    await user.type(screen.getByLabelText('Gameplay'), '5');
    await user.click(screen.getByRole('button', { name: 'SALVAR' }));

    expect(api.update).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ gameplay: 5, historia: 8, graficos: null }),
    );
    expect(await screen.findByRole('img', { name: 'Gameplay 5,0 de 10' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nota 6,5 de 10' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'EDITAR JOGO' })).not.toBeInTheDocument(),
    );
    expect(onde()).toBe('/jogos/g1');
  });

  it('Excluir pede a confirmação; ao confirmar, o jogo é removido e a pessoa vai para o catálogo', async () => {
    api.remove.mockResolvedValue(undefined);
    const user = renderAt();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(await screen.findByRole('heading', { name: 'REMOVER JOGO' })).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'REMOVER' }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(onde()).toBe('/'));
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
  });

  it('Cancelar a exclusão não remove nada e continua na página', async () => {
    const user = renderAt();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await user.click(await screen.findByRole('button', { name: 'CANCELAR' }));

    expect(api.remove).not.toHaveBeenCalled();
    expect(onde()).toBe('/jogos/g1');
    expect(screen.getByRole('heading', { level: 1, name: 'Celeste' })).toBeInTheDocument();
  });

  it('falha ao excluir mostra o erro no diálogo e não sai da página', async () => {
    api.remove.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderAt();

    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await user.click(await screen.findByRole('button', { name: 'REMOVER' }));

    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(onde()).toBe('/jogos/g1');
  });

  it('Voltar num link direto vai para o catálogo', async () => {
    const user = renderAt(['/jogos/g1']);

    await user.click(await screen.findByRole('button', { name: 'Voltar' }));

    expect(onde()).toBe('/');
  });

  it('Voltar, vindo da lista, volta para ela com o filtro que estava (histórico)', async () => {
    const user = renderAt(['/?status=ZERADO', '/jogos/g1']);

    await user.click(await screen.findByRole('button', { name: 'Voltar' }));

    expect(onde()).toBe('/?status=ZERADO');
  });
});

describe('carregando, erro e "não encontrado" (CA-28)', () => {
  it('enquanto a lista carrega, o esqueleto (sem Editar nem Excluir)', () => {
    api.list.mockReturnValue(new Promise(() => undefined));
    renderAt();

    const esqueleto = screen.getByRole('status', { name: 'Carregando jogo' });
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(esqueleto.querySelector('.skeleton')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('id inexistente (ou de outro usuário: a lista só traz os dele): "Jogo não encontrado" com link para /', async () => {
    api.list.mockResolvedValue([game({ id: 'outro' })]);
    renderAt(['/jogos/g1']);

    expect(await screen.findByRole('heading', { name: 'Jogo não encontrado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para os jogos' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Celeste');
  });

  it('a mesma mensagem para uma lista vazia: não revela se o id existe', async () => {
    api.list.mockResolvedValue([]);
    renderAt(['/jogos/qualquer-coisa']);

    expect(await screen.findByRole('heading', { name: 'Jogo não encontrado' })).toBeInTheDocument();
  });

  it('não deu para carregar a lista: erro com "Tentar de novo"', async () => {
    api.list.mockRejectedValueOnce(httpError(500)).mockResolvedValue([game()]);
    const user = renderAt();

    expect(await screen.findByText('Não deu para carregar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Celeste' })).toBeInTheDocument();
  });

  it('o link direto usa só a lista já existente: nenhuma rota nova (uma chamada ao list)', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

describe('layout e acessibilidade (CA-30)', () => {
  it('Voltar, Editar e Excluir têm pelo menos 44 px de altura (min-h-11)', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    for (const nome of ['Voltar', 'Editar', 'Excluir']) {
      expect(screen.getByRole('button', { name: nome })).toHaveClass('min-h-11');
    }
  });

  it('coluna única no celular e a capa ao lado das notas a partir de 1024 px (lg:flex-row)', async () => {
    renderAt();
    const article = (await screen.findByRole('article')) as HTMLElement;

    expect(article).toHaveClass('flex-col');
    expect(article).toHaveClass('lg:flex-row');
  });

  it('a página tem um único h1 (o título) e o "Nota geral", "Avaliação" e "Descrição" são h2', async () => {
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Celeste' });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Nota geral',
      'Avaliação',
      'Descrição',
    ]);
  });
});
