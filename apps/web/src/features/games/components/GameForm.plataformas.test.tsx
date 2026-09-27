import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ContaVinculada, type Game, type ItemBiblioteca } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integracoesApi } from '@/features/integracoes/api/integracoes-api';
import { gamesApi } from '../api/games-api';
import { GameForm } from './GameForm';

/** O botão único "Buscar em uma plataforma" abre a lista; a pessoa escolhe a plataforma. */
async function buscarEm(user: ReturnType<typeof userEvent.setup>, nome: string) {
  await user.click(await screen.findByRole('button', { name: 'Buscar em uma plataforma' }));
  await user.click(await screen.findByRole('menuitem', { name: nome }));
}

vi.mock('../api/games-api', () => ({
  gamesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    uploadCover: vi.fn(),
    removeCover: vi.fn(),
  },
}));
vi.mock('@/features/integracoes/api/integracoes-api', () => ({
  integracoesApi: { listarContas: vi.fn(), biblioteca: vi.fn(), vincularJogo: vi.fn() },
}));

const games = vi.mocked(gamesApi);
const integ = vi.mocked(integracoesApi);

// Dados sintéticos e óbvios (RULES.md §8).
const conta = (provedor: ContaVinculada['provedor']): ContaVinculada => ({
  provedor,
  idExterno: 'ID_SINTETICO',
  nomeExibicao: 'Conta Sintetica',
  vinculadaEm: '2026-09-27T12:00:00.000Z',
  estado: 'ativa',
});

const itemSteam: ItemBiblioteca = {
  idExterno: '100',
  titulo: 'Jogo Steam',
  capaUrl: 'https://cdn.steamstatic.com/capa.jpg',
  minutosJogados: 90,
  ultimaVezJogadoEm: null,
  jogosParecidos: [],
  vinculadoA: null,
};

const itemPs5: ItemBiblioteca = {
  idExterno: 'PPSA01234_00',
  titulo: 'Jogo Exemplo',
  capaUrl: 'https://image.api.playstation.com/exemplo/a.png',
  plataformaSugerida: 'PS5',
  minutosJogados: 600,
  ultimaVezJogadoEm: null,
  jogosParecidos: [],
  vinculadoA: null,
};

const itemPs4: ItemBiblioteca = {
  ...itemPs5,
  idExterno: 'CUSA01234_00',
  plataformaSugerida: 'PS4',
  minutosJogados: 30,
};

const criado = (over: Partial<Game> = {}): Game => ({
  id: 'novo1',
  titulo: 'Jogo Exemplo',
  plataforma: 'PS5',
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-27T12:00:00.000Z',
  atualizadoEm: '2026-09-27T12:00:00.000Z',
  dadosPlataforma: [],
  ...over,
});

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <GameForm onDone={onDone} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return { onDone, user: userEvent.setup({ applyAccept: false }) };
}

const salvar = () => screen.getByRole('button', { name: 'Salvar' });

beforeEach(() => {
  vi.resetAllMocks();
  games.list.mockResolvedValue([]);
  integ.listarContas.mockResolvedValue([conta('STEAM'), conta('PLAYSTATION')]);
  integ.biblioteca.mockImplementation((provedor) =>
    Promise.resolve(provedor === 'PLAYSTATION' ? [itemPs5, itemPs4] : [itemSteam]),
  );
  integ.vincularJogo.mockResolvedValue({} as never);
});

describe('GameForm — Buscar na Steam e Buscar na PlayStation (CA-32 a CA-36)', () => {
  it('com as duas contas: UM botão que abre a lista, na ordem do cadastro', async () => {
    const { user } = renderForm();

    await user.click(await screen.findByRole('button', { name: 'Buscar em uma plataforma' }));
    const itens = within(await screen.findByRole('menu')).getAllByRole('menuitem');

    expect(itens.map((item) => item.textContent)).toEqual(['Steam', 'PlayStation']);
    expect(screen.queryByRole('button', { name: /Buscar na / })).toBeNull();
  });

  it('só a PlayStation vinculada: a lista tem só ela', async () => {
    integ.listarContas.mockResolvedValue([conta('PLAYSTATION')]);
    const { user } = renderForm();

    await user.click(await screen.findByRole('button', { name: 'Buscar em uma plataforma' }));

    const itens = within(await screen.findByRole('menu')).getAllByRole('menuitem');
    expect(itens.map((item) => item.textContent)).toEqual(['PlayStation']);
  });

  it('nenhuma conta: o convite genérico a vincular no perfil', async () => {
    integ.listarContas.mockResolvedValue([]);
    renderForm();

    expect(await screen.findByText(/Vincule sua conta no perfil/)).toBeInTheDocument();
  });

  it('PS4 e PS5 do mesmo jogo aparecem como DOIS itens, cada um com o seu "Criar jogo"; nada é escolhido por nome (CA-34)', async () => {
    const { user } = renderForm();

    await buscarEm(user, 'PlayStation');
    const lista = await screen.findByRole('list', { name: 'Jogos da PlayStation' });

    expect(within(lista).getAllByText('Jogo Exemplo')).toHaveLength(2);
    expect(within(lista).getAllByRole('button', { name: /Criar jogo: Jogo Exemplo/ })).toHaveLength(
      2,
    );
    expect(integ.vincularJogo).not.toHaveBeenCalled();
  });

  it('"Criar jogo" de um item PS5 preenche a plataforma PS5 (editável), o status pelas horas, e o cartão "Ligado à PlayStation"', async () => {
    const { user } = renderForm();

    await buscarEm(user, 'PlayStation');
    await user.click(
      (await screen.findAllByRole('button', { name: /Criar jogo: Jogo Exemplo/ }))[0]!,
    );

    expect(screen.getByLabelText('Título')).toHaveValue('Jogo Exemplo');
    expect((screen.getByLabelText(/Plataforma/) as HTMLSelectElement).value).toBe('PS5');
    expect(screen.getByRole('button', { name: 'Jogando' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Ligado à PlayStation: «Jogo Exemplo»')).toBeInTheDocument();
    expect(screen.getByText('Prévia da capa oficial da PlayStation')).toBeInTheDocument();
    expect(games.create).not.toHaveBeenCalled();
  });

  it('Salvar cria o jogo e SÓ DEPOIS liga ao provedor certo (PlayStation), com o titleId', async () => {
    games.create.mockResolvedValue(criado());
    const { user, onDone } = renderForm();
    await buscarEm(user, 'PlayStation');
    await user.click(
      (await screen.findAllByRole('button', { name: /Criar jogo: Jogo Exemplo/ }))[0]!,
    );

    await user.click(salvar());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(games.create).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Jogo Exemplo', plataforma: 'PS5', status: 'JOGANDO' }),
    );
    expect(integ.vincularJogo).toHaveBeenCalledTimes(1);
    expect(integ.vincularJogo).toHaveBeenCalledWith('PLAYSTATION', 'novo1', {
      idExterno: 'PPSA01234_00',
    });
    expect(games.create.mock.invocationCallOrder[0]!).toBeLessThan(
      integ.vincularJogo.mock.invocationCallOrder[0]!,
    );
  });

  it('as duas plataformas ao mesmo tempo: o primeiro item manda no título; as duas ligações saem no Salvar', async () => {
    games.create.mockResolvedValue(criado({ titulo: 'Jogo Exemplo' }));
    const { user, onDone } = renderForm();
    await buscarEm(user, 'PlayStation');
    await user.click(
      (await screen.findAllByRole('button', { name: /Criar jogo: Jogo Exemplo/ }))[0]!,
    );
    await buscarEm(user, 'Steam');
    await user.click(await screen.findByRole('button', { name: /Criar jogo: Jogo Steam/ }));

    expect(screen.getByLabelText('Título')).toHaveValue('Jogo Exemplo');
    expect(screen.getByText('Ligado à Steam: «Jogo Steam»')).toBeInTheDocument();
    expect(screen.getByText('Ligado à PlayStation: «Jogo Exemplo»')).toBeInTheDocument();
    await user.click(salvar());

    // PS5 casa com a PlayStation, mas NÃO com a Steam: pede a confirmação (a da Steam) antes de criar qualquer coisa.
    expect(await screen.findByRole('group', { name: 'Confirmar a plataforma' })).toHaveTextContent(
      'Ao ligá-lo à Steam, as horas e as conquistas mostradas serão as da Steam.',
    );
    expect(games.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Salvar mesmo assim' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(integ.vincularJogo).toHaveBeenCalledWith('PLAYSTATION', 'novo1', {
      idExterno: 'PPSA01234_00',
    });
    expect(integ.vincularJogo).toHaveBeenCalledWith('STEAM', 'novo1', { idExterno: '100' });
  });

  it('jogo de plataforma que não é da PlayStation (Xbox) pede a confirmação do cadastro; PS4 não pede (CA-36)', async () => {
    games.create.mockResolvedValue(criado({ plataforma: 'Xbox One' }));
    const { user, onDone } = renderForm();
    await buscarEm(user, 'PlayStation');
    await user.click(
      (await screen.findAllByRole('button', { name: /Criar jogo: Jogo Exemplo/ }))[0]!,
    );

    await user.selectOptions(screen.getByLabelText(/Plataforma/), 'PS4');
    await user.click(salvar());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole('group', { name: 'Confirmar a plataforma' })).toBeNull();
  });

  it('a confirmação usa o texto do cadastro: "as horas e os troféus mostrados serão os da PlayStation"', async () => {
    const { user } = renderForm();
    await buscarEm(user, 'PlayStation');
    await user.click(
      (await screen.findAllByRole('button', { name: /Criar jogo: Jogo Exemplo/ }))[0]!,
    );
    await user.selectOptions(screen.getByLabelText(/Plataforma/), 'Xbox One');

    await user.click(salvar());

    const confirmar = await screen.findByRole('group', { name: 'Confirmar a plataforma' });
    expect(confirmar).toHaveTextContent(
      'Ao ligá-lo à PlayStation, as horas e os troféus mostrados serão os da PlayStation. A plataforma do jogo não muda.',
    );
    expect(games.create).not.toHaveBeenCalled();
  });
});
