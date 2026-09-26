import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type ContaVinculada, type Game, type ItemBiblioteca } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integracoesApi } from '@/features/integracoes/api/integracoes-api';
import { gamesApi } from '../api/games-api';
import { GameForm } from './GameForm';

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
const CONTA: ContaVinculada = {
  provedor: 'STEAM',
  idExterno: 'STEAMID_SINTETICO',
  nomeExibicao: 'Jogador Sintetico',
  vinculadaEm: '2026-09-25T12:00:00.000Z',
};

const item = (over: Partial<ItemBiblioteca> = {}): ItemBiblioteca => ({
  idExterno: '100',
  titulo: 'Jogo Sintetico',
  capaUrl: 'https://cdn.steamstatic.com/capa.jpg',
  minutosJogados: 90,
  ultimaVezJogadoEm: null,
  jogosParecidos: [],
  vinculadoA: null,
  ...over,
});

const criado = (over: Partial<Game> = {}): Game => ({
  id: 'novo1',
  titulo: 'Jogo Sintetico',
  plataforma: 'PC',
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-25T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-25T12:00:00.000Z',
  ...over,
});

function erroHttp(status: number, code: string): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function renderForm() {
  const onDone = vi.fn();
  const onLinkedExisting = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <GameForm onDone={onDone} onCancel={vi.fn()} onLinkedExisting={onLinkedExisting} />
    </QueryClientProvider>,
  );
  return { onDone, onLinkedExisting, user: userEvent.setup({ applyAccept: false }) };
}

async function buscarECriar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Buscar na Steam' }));
  await user.click(await screen.findByRole('button', { name: /Criar jogo: Jogo Sintetico/ }));
}

const salvar = () => screen.getByRole('button', { name: 'Salvar' });

beforeEach(() => {
  vi.resetAllMocks();
  games.list.mockResolvedValue([]);
  integ.listarContas.mockResolvedValue([CONTA]);
  integ.biblioteca.mockResolvedValue([item()]);
  integ.vincularJogo.mockResolvedValue({} as never);
});

describe('GameForm — buscar na Steam (jogo novo)', () => {
  it('sem conta vinculada: não há busca, só o convite a vincular no perfil', async () => {
    integ.listarContas.mockResolvedValue([]);
    renderForm();

    expect(await screen.findByText(/Vincule sua Steam no perfil/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Buscar na Steam' })).toBeNull();
  });

  it('editar um jogo existente não mostra a busca', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <GameForm game={criado()} onDone={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText('Título');
    expect(screen.queryByRole('button', { name: 'Buscar na Steam' })).toBeNull();
  });

  it('"Criar jogo" preenche título, PC e status pelas horas (capa só como prévia); "Remover ligação" tira o chip', async () => {
    const { user } = renderForm();

    await buscarECriar(user);

    expect(screen.getByLabelText('Título')).toHaveValue('Jogo Sintetico');
    expect((screen.getByLabelText(/Plataforma/) as HTMLSelectElement).value).toBe('PC');
    expect(screen.getByRole('button', { name: 'Jogando' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Ligado à Steam: «Jogo Sintetico»')).toBeInTheDocument();
    expect(integ.vincularJogo).not.toHaveBeenCalled();
    expect(games.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remover ligação' }));
    expect(screen.queryByText(/Ligado à Steam/)).toBeNull();
    expect(screen.getByLabelText('Título')).toHaveValue('Jogo Sintetico');
  });

  it('o cartão "Ligado à Steam" mostra as horas, a capa oficial em pé só como prévia, e "Trocar" reabre a busca (CA-49)', async () => {
    const { user } = renderForm();
    await buscarECriar(user);

    expect(screen.getByText('1 h 30 min. A capa oficial é só prévia.')).toBeInTheDocument();
    expect(screen.getByText('Prévia da capa oficial da Steam')).toBeInTheDocument();
    const miniatura = document.querySelector('img[src="https://cdn.steamstatic.com/capa.jpg"]');
    expect(miniatura).toHaveAttribute('width', '44');
    expect(miniatura).toHaveAttribute('height', '58');

    await user.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(await screen.findByRole('button', { name: /Criar jogo: Jogo Sintetico/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remover ligação' })).toBeInTheDocument();
  });

  it('0 minutos sugere "Quero jogar" (e nunca "Zerado")', async () => {
    integ.biblioteca.mockResolvedValue([item({ minutosJogados: 0 })]);
    const { user } = renderForm();

    await buscarECriar(user);

    expect(screen.getByRole('button', { name: 'Quero jogar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Zerado' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Salvar cria o jogo e SÓ DEPOIS liga o item; a capa oficial não é enviada', async () => {
    games.create.mockResolvedValue(criado());
    const { user, onDone } = renderForm();
    await buscarECriar(user);

    await user.click(salvar());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(games.create).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Jogo Sintetico', plataforma: 'PC', status: 'JOGANDO' }),
    );
    expect(integ.vincularJogo).toHaveBeenCalledWith('STEAM', 'novo1', { idExterno: '100' });
    expect(games.create.mock.invocationCallOrder[0]!).toBeLessThan(
      integ.vincularJogo.mock.invocationCallOrder[0]!,
    );
    expect(games.uploadCover).not.toHaveBeenCalled();
  });

  it('a ligação falha: o jogo fica salvo, o formulário segue aberto e o próximo Salvar só religa (sem criar de novo)', async () => {
    games.create.mockResolvedValue(criado());
    games.update.mockResolvedValue(criado());
    integ.vincularJogo.mockRejectedValueOnce(erroHttp(502, 'PLATAFORMA_INDISPONIVEL'));
    const { user, onDone } = renderForm();
    await buscarECriar(user);

    await user.click(salvar());

    expect(
      await screen.findByText(/O jogo foi salvo, mas não foi ligado à Steam/),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText('Editar jogo')).toBeInTheDocument();

    await user.click(salvar());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(games.create).toHaveBeenCalledTimes(1);
    expect(games.update).toHaveBeenCalledTimes(1);
    expect(integ.vincularJogo).toHaveBeenCalledTimes(2);
    expect(integ.vincularJogo).toHaveBeenLastCalledWith('STEAM', 'novo1', { idExterno: '100' });
  });

  it('plataforma que não é vazia nem PC pede confirmação ANTES de criar qualquer coisa', async () => {
    games.create.mockResolvedValue(criado({ plataforma: 'PS5' }));
    const { user, onDone } = renderForm();
    await buscarECriar(user);
    await user.selectOptions(screen.getByLabelText(/Plataforma/), 'PS5');

    await user.click(salvar());

    const confirmar = await screen.findByRole('group', { name: 'Confirmar a plataforma' });
    expect(within(confirmar).getByText(/é um jogo de PS5/)).toBeInTheDocument();
    expect(games.create).not.toHaveBeenCalled();
    expect(integ.vincularJogo).not.toHaveBeenCalled();

    await user.click(within(confirmar).getByRole('button', { name: 'Voltar' }));
    expect(games.create).not.toHaveBeenCalled();

    await user.click(salvar());
    await user.click(await screen.findByRole('button', { name: 'Salvar mesmo assim' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(games.create).toHaveBeenCalledTimes(1);
    expect(integ.vincularJogo).toHaveBeenCalledTimes(1);
  });

  it('sem ligação (chip removido) o Salvar é o de sempre: nada é ligado nem confirmado', async () => {
    games.create.mockResolvedValue(criado({ plataforma: 'PS5' }));
    const { user, onDone } = renderForm();
    await buscarECriar(user);
    await user.selectOptions(screen.getByLabelText(/Plataforma/), 'PS5');
    await user.click(screen.getByRole('button', { name: 'Remover ligação' }));

    await user.click(salvar());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(integ.vincularJogo).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Confirmar a plataforma' })).toBeNull();
  });

  it('"Vincular a este" num jogo parecido liga a ele, não cria nada e leva ao jogo', async () => {
    integ.biblioteca.mockResolvedValue([
      item({ jogosParecidos: [{ id: 'g9', titulo: 'Jogo Sintetico', plataforma: 'PC' }] }),
    ]);
    const { user, onLinkedExisting, onDone } = renderForm();

    await user.click(await screen.findByRole('button', { name: 'Buscar na Steam' }));
    await user.click(
      await screen.findByRole('button', { name: 'Vincular Jogo Sintetico a Jogo Sintetico' }),
    );

    await waitFor(() => expect(onLinkedExisting).toHaveBeenCalledWith('g9'));
    expect(integ.vincularJogo).toHaveBeenCalledWith('STEAM', 'g9', { idExterno: '100' });
    expect(games.create).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
