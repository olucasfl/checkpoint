import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type ContaVinculada, type ResumoContaPlataforma } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integracoesApi } from '../api/integracoes-api';
import { PlataformasDoPerfil } from './PlataformasDoPerfil';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: {
    listarContas: vi.fn(),
    resumo: vi.fn(),
    atualizarResumo: vi.fn(),
    desvincular: vi.fn(),
    biblioteca: vi.fn(),
    vincularJogo: vi.fn(),
    vincularComCredencial: vi.fn(),
    iniciarVinculo: vi.fn(),
  },
}));
vi.mock('@/shared/lib/avisos', () => ({ avisar: vi.fn() }));

const api = vi.mocked(integracoesApi);

// Dados sintéticos e óbvios (RULES.md §8).
const CONTA: ContaVinculada = {
  provedor: 'PLAYSTATION',
  idExterno: '1234567890123456789',
  nomeExibicao: 'conta_exemplo',
  vinculadaEm: '2026-09-27T12:00:00.000Z',
  estado: 'ativa',
};

const RESUMO: ResumoContaPlataforma = {
  provedor: 'PLAYSTATION',
  nomeExibicao: 'conta_exemplo',
  avatarUrl: 'https://image.api.playstation.com/exemplo/a.png',
  perfilUrl: null,
  membroDesde: null,
  status: null,
  jogandoAgora: null,
  totalJogos: 4,
  minutosTotais: 15_000,
  jogosJogados: 3,
  nuncaJogados: 1,
  maisJogados: [
    { idExterno: 'PPSA01234_00', titulo: 'Jogo Exemplo', capaUrl: null, minutosJogados: 13_736 },
  ],
  noCheckpoint: { ligados: 2, naBiblioteca: 4 },
  conquistas: { desbloqueadas: 12, total: 40, jogosVinculados: 2 },
  nivel: { valor: 312, progressoPercentual: 42, faixa: 4 },
  trofeus: { platina: 3, ouro: 20, prata: 50, bronze: 100 },
  consultadoEm: new Date().toISOString(),
};

function erroHttp(status: number, code: string): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

async function abrirPopup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlataformasDoPerfil />
    </QueryClientProvider>,
  );
  const user = userEvent.setup({ applyAccept: false });
  await user.click(await screen.findByRole('button', { name: /conta_exemplo/ }));
  return { user, dialogo: await screen.findByRole('dialog') };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listarContas.mockResolvedValue([CONTA]);
  api.resumo.mockResolvedValue(RESUMO);
});

describe('popup da conta PlayStation (CA-56 a CA-66)', () => {
  it('a linha e o popup dividem UMA consulta ao resumo (CA-56)', async () => {
    await abrirPopup();

    expect(api.resumo).toHaveBeenCalledTimes(1);
    expect(api.resumo).toHaveBeenCalledWith('PLAYSTATION');
  });

  it('mostra nível, faixa, % e a contagem por tipo em texto, os números, os mais jogados e "X dos seus Y jogos" (CA-61)', async () => {
    const { dialogo } = await abrirPopup();

    expect(await within(dialogo).findByText('Nível 312')).toBeInTheDocument();
    expect(within(dialogo).getByText('faixa 4 de 10')).toBeInTheDocument();
    expect(within(dialogo).getByText('42% até o próximo nível')).toBeInTheDocument();
    const porTipo = within(dialogo).getByRole('list', { name: 'Troféus por tipo' });
    expect(porTipo).toHaveTextContent('Platina3');
    expect(porTipo).toHaveTextContent('Ouro20');
    expect(porTipo).toHaveTextContent('Prata50');
    expect(porTipo).toHaveTextContent('Bronze100');
    expect(within(dialogo).getByText('Jogo Exemplo')).toBeInTheDocument();
    expect(
      within(dialogo).getByText(/2 dos seus 4 jogos já estão no checkpoint/),
    ).toBeInTheDocument();
    expect(within(dialogo).getByText('12 troféus em 2 jogos vinculados')).toBeInTheDocument();
  });

  it('NÃO mostra "membro desde", status, "abrir perfil", backlog nem "Ver e importar" (limitações da PSN)', async () => {
    const { dialogo } = await abrirPopup();
    await within(dialogo).findByText('Nível 312');

    for (const texto of [
      /desde/,
      /Online|Offline|Em jogo|Jogando/,
      /Abrir perfil/,
      /Backlog/,
      /nunca aberto/,
      /Ver e importar/,
    ]) {
      expect(within(dialogo).queryByText(texto)).toBeNull();
    }
    expect(within(dialogo).getByRole('button', { name: 'Importar jogos' })).toBeInTheDocument();
  });

  it('rodapé provisório: "Não afiliado à Sony Interactive Entertainment", sem atribuição legal inventada; nome em texto, sem logo (CA-63)', async () => {
    const { dialogo } = await abrirPopup();

    const rodape = dialogo.querySelector('footer') as HTMLElement;
    expect(rodape).toHaveTextContent('Não afiliado à Sony Interactive Entertainment');
    expect(rodape.querySelectorAll('p')).toHaveLength(1);
    expect(dialogo.querySelector('img[src*="/plataformas/"]')).toBeNull();
    expect(within(dialogo).getAllByText('PlayStation').length).toBeGreaterThan(0);
  });

  it('em `reautenticar` (409): Chek, "Sua conexão com a PlayStation expirou", o formulário do NPSSO; cabeçalho e Desvincular ficam (CA-64)', async () => {
    api.resumo.mockRejectedValue(erroHttp(409, 'PLATAFORMA_REAUTENTICAR'));
    const { user, dialogo } = await abrirPopup();

    expect(
      await within(dialogo).findByText(/Sua conexão com a PlayStation expirou/),
    ).toBeInTheDocument();
    expect(within(dialogo).getByText('conta_exemplo')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Desvincular' })).toBeInTheDocument();
    expect(within(dialogo).queryByText('Nível 312')).toBeNull();

    await user.click(within(dialogo).getByRole('button', { name: 'Reconectar' }));
    const formulario = await screen.findByRole('dialog', { name: /Reconectar PlayStation/ });
    expect(within(formulario).getByLabelText('NPSSO')).toHaveAttribute('type', 'password');
  });

  it('502: mensagem e "Tentar de novo", que refaz a consulta', async () => {
    api.resumo.mockRejectedValue(erroHttp(502, 'PLATAFORMA_INDISPONIVEL'));
    const { user, dialogo } = await abrirPopup();

    expect(
      await within(dialogo).findByText('Não foi possível falar com a PlayStation agora.'),
    ).toBeInTheDocument();
    api.resumo.mockResolvedValue(RESUMO);
    await user.click(within(dialogo).getByRole('button', { name: 'Tentar de novo' }));

    expect(await within(dialogo).findByText('Nível 312')).toBeInTheDocument();
    expect(api.resumo.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('Desvincular pede confirmação que cita a credencial guardada; depois a linha volta a "Vincular" (CA-65)', async () => {
    api.desvincular.mockResolvedValue(undefined);
    const { user, dialogo } = await abrirPopup();
    await within(dialogo).findByText('Nível 312');

    await user.click(within(dialogo).getByRole('button', { name: 'Desvincular' }));
    const confirmar = await screen.findByRole('dialog', { name: 'Desvincular a PlayStation' });
    expect(confirmar).toHaveTextContent('credencial guardada');
    expect(confirmar).toHaveTextContent('as horas e os troféus da PlayStation');
    api.listarContas.mockResolvedValue([]);
    await user.click(within(confirmar).getByRole('button', { name: 'Desvincular' }));

    await waitFor(() => expect(api.desvincular).toHaveBeenCalledWith('PLAYSTATION'));
    expect(
      await screen.findByRole('button', { name: 'Vincular conta PlayStation' }),
    ).toBeInTheDocument();
  });
});

describe('a Steam continua igual (CA-62)', () => {
  it('sem nível nem troféus, com backlog, "Na Steam desde", link do perfil e atribuição da Valve', async () => {
    api.listarContas.mockResolvedValue([
      { ...CONTA, provedor: 'STEAM', nomeExibicao: 'Jogador Gravado' },
    ]);
    api.resumo.mockResolvedValue({
      ...RESUMO,
      provedor: 'STEAM',
      nomeExibicao: 'Jogador Sintetico',
      perfilUrl: 'https://steamcommunity.com/id/x',
      membroDesde: 2011,
      status: 'online',
      nivel: null,
      trofeus: null,
      conquistas: { desbloqueadas: 12, total: 40, jogosVinculados: 3 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlataformasDoPerfil />
      </QueryClientProvider>,
    );
    const user = userEvent.setup({ applyAccept: false });
    await user.click(await screen.findByRole('button', { name: /Jogador Gravado/ }));
    const dialogo = await screen.findByRole('dialog');

    expect(await within(dialogo).findByText('Na Steam desde 2011')).toBeInTheDocument();
    expect(within(dialogo).getByText('Abrir perfil na Steam')).toBeInTheDocument();
    expect(within(dialogo).getByText(/Backlog/)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Ver e importar' })).toBeInTheDocument();
    expect(within(dialogo).getByText('12 conquistas em 3 jogos vinculados')).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Nível/)).toBeNull();
    expect(within(dialogo).getByText(/Valve Corporation/)).toBeInTheDocument();
    expect(within(dialogo).getByText('Não afiliado à Valve')).toBeInTheDocument();
  });
});
