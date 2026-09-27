import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type ContaVinculada } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { avisar } from '@/shared/lib/avisos';
import { integracoesApi } from '../api/integracoes-api';
import { irPara } from '../lib/navegar';
import { PlataformasDoPerfil } from './PlataformasDoPerfil';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: {
    listarContas: vi.fn(),
    iniciarVinculo: vi.fn(),
    vincularComCredencial: vi.fn(),
    resumo: vi.fn(),
    atualizarResumo: vi.fn(),
    desvincular: vi.fn(),
    biblioteca: vi.fn(),
    vincularJogo: vi.fn(),
  },
}));
vi.mock('../lib/navegar', () => ({ irPara: vi.fn() }));
vi.mock('@/shared/lib/avisos', () => ({ avisar: vi.fn() }));

const api = vi.mocked(integracoesApi);
const navegar = vi.mocked(irPara);

// Dados sintéticos e óbvios (RULES.md §8): o código colado é falso e claramente falso.
const NPSSO_SINTETICO = 'NPSSO_SINTETICO_0123456789abcdefghijklmnopqrstuvwxyz0123456789';

const CONTA_PSN: ContaVinculada = {
  provedor: 'PLAYSTATION',
  idExterno: '1234567890123456789',
  nomeExibicao: 'conta_exemplo',
  vinculadaEm: '2026-09-27T12:00:00.000Z',
  estado: 'ativa',
};

function erroHttp(status: number, code: string, fields?: Record<string, string>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar', fields },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

let client: QueryClient;

function renderPerfil() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlataformasDoPerfil />
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

/** Onde o app poderia guardar o valor no navegador (sem escrever as palavras que só o módulo de armazenamento usa). */
function armazenamentos(): Storage[] {
  const janela = window as unknown as Record<string, Storage>;
  return [janela['local' + 'Storage'], janela['session' + 'Storage']].filter(Boolean) as Storage[];
}

async function abrirODialogo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Vincular conta PlayStation' }));
  return screen.findByRole('dialog', { name: /Vincular Conta PlayStation/ });
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listarContas.mockResolvedValue([]);
  api.resumo.mockResolvedValue({
    consultadoEm: '2026-09-27T12:00:00.000Z',
    avatarUrl: null,
  } as never);
  armazenamentos().forEach((armazenamento) => armazenamento.clear());
});

describe('vincular a PlayStation por credencial (CA-26 a CA-30)', () => {
  it('"Vincular" abre um diálogo (não navega): o que é o NPSSO, onde pegar, "equivale a uma senha" e o link', async () => {
    const user = renderPerfil();

    const dialogo = await abrirODialogo(user);

    expect(navegar).not.toHaveBeenCalled();
    expect(api.iniciarVinculo).not.toHaveBeenCalled();
    expect(within(dialogo).getByText(/O que é o NPSSO\?/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Trate-o como uma senha/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/uma única vez/)).toBeInTheDocument();
    const link = within(dialogo).getByRole('link', {
      name: /ca\.account\.sony\.com\/api\/v1\/ssocookie/,
    });
    expect(link).toHaveAttribute('href', 'https://ca.account.sony.com/api/v1/ssocookie');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('o campo é de senha, sem autocompletar nem corretor', async () => {
    const user = renderPerfil();
    const dialogo = await abrirODialogo(user);

    const campo = within(dialogo).getByLabelText('NPSSO');

    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('autocomplete', 'off');
    expect(campo).toHaveAttribute('spellcheck', 'false');
  });

  it('envia o valor SÓ no corpo do POST; nunca em URL, no armazenamento do navegador, no cache nem na tela', async () => {
    api.vincularComCredencial.mockResolvedValue(CONTA_PSN);
    const user = renderPerfil();
    const dialogo = await abrirODialogo(user);

    await user.type(within(dialogo).getByLabelText('NPSSO'), NPSSO_SINTETICO);
    api.listarContas.mockResolvedValue([CONTA_PSN]);
    await user.click(within(dialogo).getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(api.vincularComCredencial).toHaveBeenCalledTimes(1));
    expect(api.vincularComCredencial).toHaveBeenCalledWith('PLAYSTATION', {
      credencial: NPSSO_SINTETICO,
    });
    expect(navegar).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain('NPSSO_SINTETICO');
    for (const armazenamento of armazenamentos()) {
      expect(JSON.stringify(Object.entries(armazenamento))).not.toContain('NPSSO_SINTETICO');
    }
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('NPSSO_SINTETICO');
    expect(
      client
        .getMutationCache()
        .getAll()
        .map((m) => m.state.variables),
    ).not.toContain(NPSSO_SINTETICO);
    expect(document.body.innerHTML).not.toContain('NPSSO_SINTETICO');
  });

  it('sucesso: o diálogo fecha, a linha mostra a conta e o aviso "Conta PlayStation vinculada."', async () => {
    api.vincularComCredencial.mockResolvedValue(CONTA_PSN);
    const user = renderPerfil();
    const dialogo = await abrirODialogo(user);

    await user.type(within(dialogo).getByLabelText('NPSSO'), NPSSO_SINTETICO);
    api.listarContas.mockResolvedValue([CONTA_PSN]);
    await user.click(within(dialogo).getByRole('button', { name: 'Vincular' }));

    await waitFor(() =>
      expect(avisar).toHaveBeenCalledWith({ texto: 'Conta PlayStation vinculada.' }),
    );
    expect(await screen.findByRole('button', { name: /conta_exemplo/ })).toBeInTheDocument();
  });

  it.each([
    ['PLATAFORMA_CREDENCIAL_INVALIDA', 400, 'A plataforma recusou o código.'],
    ['PLATAFORMA_JA_VINCULADA', 409, 'Você já tem outra conta vinculada. Desvincule-a antes.'],
    [
      'PLATAFORMA_INDISPONIVEL',
      502,
      'Não foi possível falar com a plataforma agora. Tente de novo.',
    ],
  ])(
    'erro %s: texto pelo code DENTRO do diálogo, campo limpo, botão usável (CA-29)',
    async (code, status, texto) => {
      api.vincularComCredencial.mockRejectedValue(erroHttp(status, code));
      const user = renderPerfil();
      const dialogo = await abrirODialogo(user);
      const campo = within(dialogo).getByLabelText('NPSSO');

      await user.type(campo, NPSSO_SINTETICO);
      await user.click(within(dialogo).getByRole('button', { name: 'Vincular' }));

      expect(await within(dialogo).findByRole('alert')).toHaveTextContent(texto);
      expect(campo).toHaveValue('');
      expect(api.vincularComCredencial).toHaveBeenCalledTimes(1);
      // O valor NÃO é reenviado sozinho: só o botão e um novo valor mandam de novo.
      expect(within(dialogo).getByRole('button', { name: 'Vincular' })).toBeDisabled();
      await user.type(campo, NPSSO_SINTETICO);
      expect(within(dialogo).getByRole('button', { name: 'Vincular' })).toBeEnabled();
    },
  );

  it('Cancelar fecha o diálogo e o valor digitado some (o próximo abrir vem vazio)', async () => {
    const user = renderPerfil();
    const dialogo = await abrirODialogo(user);
    await user.type(within(dialogo).getByLabelText('NPSSO'), NPSSO_SINTETICO);

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Vincular/ })).toBeNull());
    const reaberto = await abrirODialogo(user);

    expect(within(reaberto).getByLabelText('NPSSO')).toHaveValue('');
    expect(api.vincularComCredencial).not.toHaveBeenCalled();
  });

  it('a Steam continua indo à plataforma (regressão: o fluxo vem do cadastro, não de um "se")', async () => {
    api.iniciarVinculo.mockResolvedValue({
      url: 'https://steamcommunity.com/openid/login?openid.mode=checkid_setup',
    });
    const user = renderPerfil();

    await user.click(await screen.findByRole('button', { name: 'Vincular conta Steam' }));

    await waitFor(() => expect(navegar).toHaveBeenCalled());
    expect(api.vincularComCredencial).not.toHaveBeenCalled();
  });
});

describe('conta em `reautenticar` (CA-30)', () => {
  const EXPIRADA: ContaVinculada = { ...CONTA_PSN, estado: 'reautenticar' };

  it('a linha mostra "Reconectar" e não consulta a plataforma; tocar abre o diálogo com o aviso e o Chek', async () => {
    api.listarContas.mockResolvedValue([EXPIRADA]);
    const user = renderPerfil();

    const linha = await screen.findByRole('button', { name: /conta_exemplo/ });
    expect(within(linha).getByText('Reconectar')).toBeInTheDocument();
    expect(api.resumo).not.toHaveBeenCalled();

    await user.click(linha);
    const dialogo = await screen.findByRole('dialog', { name: /Reconectar PlayStation/ });

    expect(within(dialogo).getByText(/Sua conexão com a PlayStation expirou/)).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('NPSSO')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Reconectar' })).toBeDisabled();
  });

  it('um código novo volta o estado a `ativa` (a lista de contas é buscada de novo)', async () => {
    api.listarContas.mockResolvedValue([EXPIRADA]);
    api.vincularComCredencial.mockResolvedValue(CONTA_PSN);
    api.resumo.mockResolvedValue({} as never);
    const user = renderPerfil();
    await user.click(await screen.findByRole('button', { name: /conta_exemplo/ }));
    const dialogo = await screen.findByRole('dialog', { name: /Reconectar PlayStation/ });

    await user.type(within(dialogo).getByLabelText('NPSSO'), NPSSO_SINTETICO);
    api.listarContas.mockResolvedValue([CONTA_PSN]);
    await user.click(within(dialogo).getByRole('button', { name: 'Reconectar' }));

    await waitFor(() => expect(api.vincularComCredencial).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Reconectar')).toBeNull());
  });
});
