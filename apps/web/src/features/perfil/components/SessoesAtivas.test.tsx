import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type SessaoAtiva } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { perfilApi } from '../api/perfil-api';
import { SessoesAtivas } from './SessoesAtivas';

vi.mock('../api/perfil-api', () => ({
  perfilApi: {
    listarSessoes: vi.fn(),
    encerrarSessao: vi.fn(),
    encerrarOutrasSessoes: vi.fn(),
  },
}));
const api = vi.mocked(perfilApi);

const sessao = (id: string, dispositivo: string, atual = false): SessaoAtiva => ({
  id,
  dispositivo,
  criadoEm: '2026-09-24T12:00:00.000Z',
  ultimoUsoEm: new Date(2026, 8, 23, 14, 32).toISOString(),
  atual,
});

const ATUAL = sessao('s-a', 'Chrome · Windows', true);
const CELULAR = sessao('s-b', 'Chrome · Android');
const OUTRO = sessao('s-c', 'Firefox · Linux');

function httpError(status: number, code: string): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function renderSessoes() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SessoesAtivas />
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

const linhas = () => within(screen.getByRole('list', { name: 'Sessões' })).getAllByRole('listitem');

beforeEach(() => {
  vi.resetAllMocks();
  api.listarSessoes.mockResolvedValue([ATUAL, CELULAR, OUTRO]);
});

describe('lista (perfil CA-12)', () => {
  it('uma linha por sessão, na ordem da API: ícone, dispositivo e "Último uso em …"', async () => {
    renderSessoes();

    await screen.findByText('Chrome · Android');
    const [a, b, c] = linhas();
    expect(a).toHaveTextContent('Chrome · Windows');
    expect(b).toHaveTextContent('Chrome · Android');
    expect(c).toHaveTextContent('Firefox · Linux');
    expect(b).toHaveTextContent('Último uso em 23/09/2026 14:32');
    expect(within(a as HTMLElement).getByText('computer')).toHaveAttribute('aria-hidden', 'true');
    expect(within(b as HTMLElement).getByText('smartphone')).toBeInTheDocument();
  });

  it('a atual tem o selo "Este aparelho" e NENHUM botão; as outras têm Encerrar de 44 × 44', async () => {
    renderSessoes();

    await screen.findByText('Chrome · Android');
    const [atual, ...outras] = linhas();
    expect(within(atual as HTMLElement).getByText('Este aparelho')).toBeInTheDocument();
    expect(within(atual as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    for (const linha of outras) {
      const botao = within(linha).getByRole('button', { name: /^Encerrar sessão/ });
      expect(botao).toHaveTextContent('Encerrar');
      expect(botao).toHaveClass('min-h-11', 'min-w-11');
      expect(within(linha).queryByText('Este aparelho')).not.toBeInTheDocument();
    }
  });

  it('Encerrar chama a API com o id, SEM confirmação, e a lista é buscada de novo', async () => {
    api.encerrarSessao.mockResolvedValue(undefined);
    const user = renderSessoes();
    await screen.findByText('Chrome · Android');
    api.listarSessoes.mockResolvedValue([ATUAL, OUTRO]);

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão Chrome · Android' }));

    expect(api.encerrarSessao).toHaveBeenCalledWith('s-b');
    expect(document.querySelector('dialog[open]')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Chrome · Android')).not.toBeInTheDocument());
    expect(api.listarSessoes).toHaveBeenCalledTimes(2);
  });

  it('404 SESSAO_NAO_ENCONTRADA: "Essa sessão já foi encerrada." pelo code, e a lista é atualizada', async () => {
    api.encerrarSessao.mockRejectedValue(httpError(404, 'SESSAO_NAO_ENCONTRADA'));
    const user = renderSessoes();
    await screen.findByText('Chrome · Android');

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão Chrome · Android' }));

    expect(await screen.findByText('Essa sessão já foi encerrada.')).toBeInTheDocument();
    await waitFor(() => expect(api.listarSessoes).toHaveBeenCalledTimes(2));
  });

  it('400 SESSAO_ATUAL (não deveria acontecer pela tela) também vira o texto do code', async () => {
    api.encerrarSessao.mockRejectedValue(httpError(400, 'SESSAO_ATUAL'));
    const user = renderSessoes();
    await screen.findByText('Chrome · Android');

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão Firefox · Linux' }));

    expect(await screen.findByText('Para encerrar esta sessão, use Sair.')).toBeInTheDocument();
  });

  it('a lista não carrega: mensagem e "Tentar de novo"', async () => {
    api.listarSessoes.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderSessoes();

    expect(await screen.findByText('Não deu para carregar as sessões.')).toBeInTheDocument();
    api.listarSessoes.mockResolvedValue([ATUAL]);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Este aparelho')).toBeInTheDocument();
  });
});

describe('"Encerrar todas as outras" (perfil CA-13)', () => {
  it('abre a confirmação com N; Encerrar chama a API, fecha e a lista fica só com este aparelho', async () => {
    api.encerrarOutrasSessoes.mockResolvedValue({ encerradas: 2 });
    const user = renderSessoes();
    await screen.findByText('Chrome · Android');
    api.listarSessoes.mockResolvedValue([ATUAL]);

    await user.click(screen.getByRole('button', { name: 'Encerrar todas as outras' }));

    const dialogo = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialogo).toHaveTextContent(
      'Encerrar 2 sessões? Esses aparelhos vão precisar entrar de novo.',
    );
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.click(within(dialogo).getByRole('button', { name: 'Encerrar' }));

    expect(api.encerrarOutrasSessoes).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
    await waitFor(() => expect(linhas()).toHaveLength(1));
    expect(
      screen.queryByRole('button', { name: 'Encerrar todas as outras' }),
    ).not.toBeInTheDocument();
  });

  it('Cancelar fecha sem chamar a API e nada muda', async () => {
    const user = renderSessoes();
    await screen.findByText('Chrome · Android');

    await user.click(screen.getByRole('button', { name: 'Encerrar todas as outras' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(api.encerrarOutrasSessoes).not.toHaveBeenCalled();
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(linhas()).toHaveLength(3);
  });

  it('sem outras sessões, o botão não aparece', async () => {
    api.listarSessoes.mockResolvedValue([ATUAL]);
    renderSessoes();

    await screen.findByText('Este aparelho');
    expect(
      screen.queryByRole('button', { name: 'Encerrar todas as outras' }),
    ).not.toBeInTheDocument();
  });

  it('erro sem conexão: mensagem dentro do diálogo, que continua aberto', async () => {
    api.encerrarOutrasSessoes.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderSessoes();
    await screen.findByText('Chrome · Android');

    await user.click(screen.getByRole('button', { name: 'Encerrar todas as outras' }));
    const dialogo = document.querySelector('dialog[open]') as HTMLElement;
    await user.click(within(dialogo).getByRole('button', { name: 'Encerrar' }));

    expect(
      await within(dialogo).findByText('Sem conexão. Tente de novo quando a conexão voltar.'),
    ).toBeInTheDocument();
    expect(document.querySelector('dialog[open]')).not.toBeNull();
  });
});
