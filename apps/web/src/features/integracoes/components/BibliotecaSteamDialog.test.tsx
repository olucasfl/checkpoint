import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type Game, type ItemBiblioteca } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '@/features/games/api/games-api';
import { integracoesApi } from '../api/integracoes-api';
import { BibliotecaSteamDialog, type ModoBiblioteca } from './BibliotecaSteamDialog';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: { biblioteca: vi.fn(), vincularJogo: vi.fn() },
}));
vi.mock('@/features/games/api/games-api', () => ({ gamesApi: { list: vi.fn() } }));

const api = vi.mocked(integracoesApi);
const games = vi.mocked(gamesApi);

// Dados sintéticos e óbvios (RULES.md §8).
const item = (over: Partial<ItemBiblioteca> = {}): ItemBiblioteca => ({
  idExterno: '100',
  titulo: 'Jogo Sintetico',
  capaUrl: null,
  minutosJogados: 90,
  ultimaVezJogadoEm: null,
  jogosParecidos: [],
  vinculadoA: null,
  ...over,
});

const jogo = (over: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Meu Jogo',
  plataforma: 'PC',
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...over,
});

function erroHttp(status: number, body: Record<string, unknown>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, message: 'não usar', ...body },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function abrir(modo: ModoBiblioteca = { tipo: 'novo' }) {
  const onClose = vi.fn();
  const onCriar = vi.fn();
  const onVinculado = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BibliotecaSteamDialog
        open
        modo={modo}
        onClose={onClose}
        onCriar={onCriar}
        onVinculado={onVinculado}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup({ applyAccept: false }), onClose, onCriar, onVinculado };
}

beforeEach(() => {
  vi.resetAllMocks();
  games.list.mockResolvedValue([]);
});

describe('BibliotecaSteamDialog — modo novo', () => {
  it('lista a biblioteca e "Criar jogo" entrega o item, sem vincular nada sozinho', async () => {
    api.biblioteca.mockResolvedValue([item()]);
    const { user, onCriar } = abrir();

    await user.click(await screen.findByRole('button', { name: /Criar jogo: Jogo Sintetico/ }));

    expect(onCriar).toHaveBeenCalledWith(expect.objectContaining({ idExterno: '100' }));
    expect(api.vincularJogo).not.toHaveBeenCalled();
    expect(screen.getByText('1,5 h')).toBeInTheDocument();
  });

  it('com jogo parecido: "Vincular a este" liga (plataforma PC, sem confirmação) e "Criar outro jogo" continua', async () => {
    api.biblioteca.mockResolvedValue([
      item({ jogosParecidos: [{ id: 'g9', titulo: 'Jogo Sintetico', plataforma: 'PC' }] }),
    ]);
    api.vincularJogo.mockResolvedValue({} as never);
    const { user, onVinculado } = abrir();

    expect(await screen.findByText('Já no seu catálogo:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar outro jogo/ })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Vincular Jogo Sintetico a Jogo Sintetico' }),
    );

    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith('g9'));
    expect(api.vincularJogo).toHaveBeenCalledWith('STEAM', 'g9', { idExterno: '100' });
  });

  it('jogo de outra plataforma pede confirmação antes de qualquer chamada; "Voltar" não liga', async () => {
    api.biblioteca.mockResolvedValue([
      item({ jogosParecidos: [{ id: 'g9', titulo: 'Jogo Sintetico', plataforma: 'PS5' }] }),
    ]);
    api.vincularJogo.mockResolvedValue({} as never);
    const { user, onVinculado } = abrir();

    await user.click(
      await screen.findByRole('button', { name: /Vincular Jogo Sintetico a Jogo Sintetico/ }),
    );

    const confirmar = screen.getByRole('group', { name: 'Confirmar a plataforma' });
    expect(within(confirmar).getByText(/é um jogo de PS5/)).toBeInTheDocument();
    expect(within(confirmar).getByText(/as da Steam/)).toBeInTheDocument();
    expect(api.vincularJogo).not.toHaveBeenCalled();

    await user.click(within(confirmar).getByRole('button', { name: 'Voltar' }));
    expect(api.vincularJogo).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole('button', { name: /Vincular Jogo Sintetico a Jogo Sintetico/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Vincular mesmo assim' }));
    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith('g9'));
    expect(api.vincularJogo).toHaveBeenCalledTimes(1);
  });

  it('"Vincular a outro jogo que já tenho" oferece só os jogos sem vínculo', async () => {
    api.biblioteca.mockResolvedValue([item()]);
    games.list.mockResolvedValue([
      jogo({ id: 'a', titulo: 'Livre' }),
      jogo({
        id: 'b',
        titulo: 'Ocupado',
        dadosPlataforma: [
          {
            provedor: 'STEAM',
            idExterno: '5',
            minutosJogados: 1,
            ultimaVezJogadoEm: null,
            conquistasTotal: null,
            conquistasDesbloqueadas: null,
            capaUrl: null,
            atualizadoEm: '2026-09-23T12:00:00.000Z',
          },
        ],
      }),
    ]);
    api.vincularJogo.mockResolvedValue({} as never);
    const { user, onVinculado } = abrir();

    await user.click(await screen.findByRole('button', { name: /a outro jogo que já tenho/ }));
    const seletor = await screen.findByLabelText('Jogo que já tenho');
    expect(within(seletor).queryByRole('option', { name: /Ocupado/ })).toBeNull();

    await user.selectOptions(seletor, 'a');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith('a'));
    expect(api.vincularJogo).toHaveBeenCalledWith('STEAM', 'a', { idExterno: '100' });
  });

  it('item já ligado a outro jogo mostra "Já ligado a «X»" e não oferece criar', async () => {
    api.biblioteca.mockResolvedValue([
      item({ vinculadoA: { id: 'g2', titulo: 'Celeste', plataforma: 'PC' } }),
    ]);
    abrir();

    expect(await screen.findByText('Já ligado a «Celeste»')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar/ })).toBeNull();
  });

  it('a busca só vai à API depois de 300 ms parado', async () => {
    api.biblioteca.mockResolvedValue([item()]);
    const { user } = abrir();
    await screen.findByRole('list', { name: 'Jogos da Steam' });

    await user.type(screen.getByLabelText('Buscar por título'), 'cel');

    await waitFor(() => expect(api.biblioteca).toHaveBeenLastCalledWith('STEAM', 'cel'));
    expect(api.biblioteca.mock.calls.filter(([, busca]) => busca !== '')).toHaveLength(1);
  });

  it.each([
    [
      'perfil privado',
      erroHttp(409, { code: 'PLATAFORMA_PERFIL_PRIVADO' }),
      /perfil Steam está privado/,
    ],
    [
      'Steam fora do ar',
      erroHttp(502, { code: 'PLATAFORMA_INDISPONIVEL' }),
      /Não foi possível falar com a Steam/,
    ],
    ['sem conexão', new AxiosError('Network Error', 'ERR_NETWORK'), /Sem conexão/],
  ])('%s: mensagem e "Tentar de novo"', async (_nome, erro, texto) => {
    api.biblioteca.mockRejectedValueOnce(erro);
    api.biblioteca.mockResolvedValueOnce([item()]);
    const { user } = abrir();

    expect(await screen.findByText(texto)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('list', { name: 'Jogos da Steam' })).toBeInTheDocument();
  });

  it('biblioteca vazia e busca sem resultado têm textos próprios', async () => {
    api.biblioteca.mockResolvedValue([]);
    const { user } = abrir();

    expect(await screen.findByText('Sua biblioteca da Steam está vazia.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar por título'), 'zzz');
    expect(await screen.findByText('Nenhum jogo encontrado para «zzz».')).toBeInTheDocument();
  });
});

describe('BibliotecaSteamDialog — modo vincular', () => {
  it('liga o jogo escolhido ao item (PC: sem confirmação)', async () => {
    api.biblioteca.mockResolvedValue([item()]);
    api.vincularJogo.mockResolvedValue({} as never);
    const { user, onVinculado } = abrir({ tipo: 'vincular', jogo: jogo() });

    await user.click(
      await screen.findByRole('button', { name: 'Vincular Jogo Sintetico a Meu Jogo' }),
    );

    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith('g1'));
    expect(api.vincularJogo).toHaveBeenCalledWith('STEAM', 'g1', { idExterno: '100' });
    expect(screen.queryByRole('button', { name: /Criar/ })).toBeNull();
  });

  it('409 de item já ligado: avisa e só move com "Mover o vínculo" (reenvia com mover: true)', async () => {
    api.biblioteca.mockResolvedValue([
      item({ vinculadoA: { id: 'g2', titulo: 'Celeste', plataforma: 'PC' } }),
    ]);
    api.vincularJogo.mockRejectedValueOnce(
      erroHttp(409, {
        code: 'PLATAFORMA_ITEM_JA_VINCULADO',
        jogoAtual: { id: 'g2', titulo: 'Celeste' },
      }),
    );
    api.vincularJogo.mockResolvedValueOnce({} as never);
    const { user, onVinculado } = abrir({ tipo: 'vincular', jogo: jogo() });

    await user.click(
      await screen.findByRole('button', { name: /Vincular Jogo Sintetico a Meu Jogo/ }),
    );

    const aviso = await screen.findByRole('group', { name: 'Item já ligado a outro jogo' });
    expect(within(aviso).getByText(/«Celeste» perde as horas/)).toBeInTheDocument();
    expect(api.vincularJogo).toHaveBeenCalledTimes(1);
    expect(onVinculado).not.toHaveBeenCalled();

    await user.click(within(aviso).getByRole('button', { name: 'Mover o vínculo' }));

    await waitFor(() => expect(onVinculado).toHaveBeenCalledWith('g1'));
    expect(api.vincularJogo).toHaveBeenLastCalledWith('STEAM', 'g1', {
      idExterno: '100',
      mover: true,
    });
  });

  it('o item já ligado a este mesmo jogo não tem botão de vincular', async () => {
    api.biblioteca.mockResolvedValue([
      item({ vinculadoA: { id: 'g1', titulo: 'Meu Jogo', plataforma: 'PC' } }),
    ]);
    abrir({ tipo: 'vincular', jogo: jogo() });

    expect(await screen.findByText('Já ligado a este jogo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vincular Jogo Sintetico/ })).toBeNull();
  });

  it('erro do servidor no vínculo aparece no diálogo e nada é reportado como ligado', async () => {
    api.biblioteca.mockResolvedValue([item()]);
    api.vincularJogo.mockRejectedValue(erroHttp(502, { code: 'PLATAFORMA_INDISPONIVEL' }));
    const { user, onVinculado } = abrir({ tipo: 'vincular', jogo: jogo() });

    await user.click(
      await screen.findByRole('button', { name: /Vincular Jogo Sintetico a Meu Jogo/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Não foi possível falar com a plataforma/,
    );
    expect(onVinculado).not.toHaveBeenCalled();
  });
});
