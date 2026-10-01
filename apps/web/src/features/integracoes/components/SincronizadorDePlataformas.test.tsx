import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { type ContaVinculada } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMES_QUERY_KEY } from '@/features/games/api/use-games';
import { integracoesApi } from '../api/integracoes-api';
import { SincronizadorDePlataformas } from './SincronizadorDePlataformas';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: { listarContas: vi.fn(), sincronizar: vi.fn() },
}));
const api = vi.mocked(integracoesApi);

const conta = (
  provedor: ContaVinculada['provedor'],
  estado: ContaVinculada['estado'] = 'ativa',
): ContaVinculada => ({
  provedor,
  idExterno: '1',
  nomeExibicao: 'Jogador',
  vinculadaEm: '2026-09-25T12:00:00.000Z',
  estado,
});

function renderSincronizador() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const invalidar = vi.spyOn(client, 'invalidateQueries');
  /** Mostra quantas sincronizações estão em andamento, para o teste esperar o fim delas. */
  function EmAndamento() {
    const n = useIsFetching({ queryKey: ['integracoes', 'sincronizacao'] });
    return <output data-testid="em-andamento">{n}</output>;
  }
  render(
    <QueryClientProvider client={client}>
      <SincronizadorDePlataformas />
      <EmAndamento />
    </QueryClientProvider>,
  );
  const terminou = () =>
    waitFor(() => expect(api.sincronizar.mock.calls.length).toBeGreaterThan(0)).then(() =>
      waitFor(() => expect(screen.getByTestId('em-andamento')).toHaveTextContent('0')),
    );
  return { client, invalidar, terminou };
}

const chavesInvalidadas = (invalidar: { mock: { calls: unknown[][] } }) =>
  invalidar.mock.calls.map(([filtro]) =>
    JSON.stringify((filtro as { queryKey: unknown }).queryKey),
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SincronizadorDePlataformas (horas atualizadas sozinhas ao entrar)', () => {
  it('sincroniza UMA vez cada conta ativa e pula a que pede reautenticação', async () => {
    api.listarContas.mockResolvedValue([conta('STEAM'), conta('PLAYSTATION', 'reautenticar')]);
    api.sincronizar.mockResolvedValue({ atualizados: 0 });

    const { terminou } = renderSincronizador();
    await terminou();

    expect(api.sincronizar).toHaveBeenCalledTimes(1);
    expect(api.sincronizar).toHaveBeenCalledWith('STEAM');
  });

  it('com duas contas ativas, sincroniza as duas', async () => {
    api.listarContas.mockResolvedValue([conta('STEAM'), conta('PLAYSTATION')]);
    api.sincronizar.mockResolvedValue({ atualizados: 0 });

    renderSincronizador();

    await waitFor(() => expect(api.sincronizar).toHaveBeenCalledTimes(2));
    expect(api.sincronizar.mock.calls.map(([p]) => p).sort()).toEqual(['PLAYSTATION', 'STEAM']);
  });

  it('sem nenhuma conta vinculada, não chama a plataforma', async () => {
    api.listarContas.mockResolvedValue([]);

    renderSincronizador();

    await waitFor(() => expect(api.listarContas).toHaveBeenCalled());
    expect(api.sincronizar).not.toHaveBeenCalled();
  });

  it('as horas mudaram (8 h → 11 h): busca o catálogo de novo e o que depende dele', async () => {
    api.listarContas.mockResolvedValue([conta('PLAYSTATION')]);
    api.sincronizar.mockResolvedValue({ atualizados: 1 });

    const { invalidar, terminou } = renderSincronizador();
    await terminou();

    const chaves = chavesInvalidadas(invalidar);
    expect(chaves).toContain(JSON.stringify(GAMES_QUERY_KEY));
    expect(chaves).toContain(JSON.stringify(['integracoes', 'jogo', 'PLAYSTATION']));
    expect(chaves).toContain(JSON.stringify(['integracoes', 'resumo', 'PLAYSTATION']));
  });

  it('nada mudou: NÃO recarrega o catálogo (uma request a menos)', async () => {
    api.listarContas.mockResolvedValue([conta('STEAM')]);
    api.sincronizar.mockResolvedValue({ atualizados: 0 });

    const { invalidar, terminou } = renderSincronizador();
    await terminou();

    expect(invalidar).not.toHaveBeenCalled();
  });

  it('a falha é silenciosa: não lança, não invalida e o catálogo gravado continua', async () => {
    api.listarContas.mockResolvedValue([conta('STEAM')]);
    api.sincronizar.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));

    const { client, invalidar, terminou } = renderSincronizador();
    client.setQueryData(GAMES_QUERY_KEY, [{ id: 'g1' }]);
    await terminou();

    expect(invalidar).not.toHaveBeenCalled();
    expect(client.getQueryData(GAMES_QUERY_KEY)).toEqual([{ id: 'g1' }]);
  });
});
