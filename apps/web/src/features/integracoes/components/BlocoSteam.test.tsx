import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import {
  type Conquista,
  type DadosJogoPlataforma,
  type DetalheJogoPlataforma,
  type Game,
} from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { avisosNaFila } from '@/shared/lib/avisos';
import { integracoesApi } from '../api/integracoes-api';
import { BlocoSteam } from './BlocoSteam';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: { detalheDoJogo: vi.fn(), atualizarJogo: vi.fn(), desvincularJogo: vi.fn() },
}));

const api = vi.mocked(integracoesApi);

// Dados sintéticos e óbvios (RULES.md §8).
const dados = (extra: Partial<DadosJogoPlataforma> = {}): DadosJogoPlataforma => ({
  provedor: 'STEAM',
  idExterno: '504230',
  minutosJogados: 2550,
  ultimaVezJogadoEm: '2026-02-17T12:00:00.000Z',
  conquistasTotal: 40,
  conquistasDesbloqueadas: 12,
  capaUrl: null,
  atualizadoEm: '2026-09-25T12:00:00.000Z',
  ...extra,
});

const jogo = (extra: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Jogo Sintetico',
  plataforma: 'PC',
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [dados()],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...extra,
});

const conquista = (id: string, extra: Partial<Conquista> = {}): Conquista => ({
  id,
  nome: `Nome ${id}`,
  descricao: `Descrição ${id}`,
  oculta: false,
  desbloqueada: false,
  desbloqueadaEm: null,
  iconeUrl: `https://steamcdn-a.akamaihd.net/${id}.jpg`,
  raridadePercentual: 10,
  ...extra,
});

const detalhe = (extra: Partial<DetalheJogoPlataforma> = {}): DetalheJogoPlataforma => ({
  dados: dados(),
  conquistas: [
    conquista('velha', {
      desbloqueada: true,
      desbloqueadaEm: '2025-01-01T12:00:00.000Z',
      raridadePercentual: 80,
    }),
    conquista('nova', {
      desbloqueada: true,
      desbloqueadaEm: '2026-02-17T12:00:00.000Z',
      raridadePercentual: 12.4,
    }),
    conquista('rara', { raridadePercentual: 1.5 }),
    conquista('comum', { raridadePercentual: 60 }),
    conquista('segredo', { oculta: true, descricao: null, raridadePercentual: null }),
  ],
  aviso: null,
  ...extra,
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

function abrir(game: Game = jogo()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <BlocoSteam game={game} />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup({ applyAccept: false }) };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('BlocoSteam — dados (CA-51)', () => {
  it('horas, última vez, barra de progresso, Atualizar, Desvincular e Abrir na Steam', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    abrir();

    expect(await screen.findByText('Tempo jogado na Steam')).toBeInTheDocument();
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
    expect(screen.getByText('Último jogo em')).toBeInTheDocument();
    expect(screen.getByText('17/02/2026')).toBeInTheDocument();
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '12');
    expect(barra).toHaveAttribute('aria-valuemax', '40');
    expect(barra).toHaveAccessibleName('12 de 40 conquistas');
    expect(screen.getByText('Conquistas · 12 de 40')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Abrir na Steam/ });
    expect(link).toHaveAttribute('href', 'https://store.steampowered.com/app/504230');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('o cabeçalho diz há quanto tempo os dados foram atualizados, e o título "Steam" é um h2 (CA-45)', async () => {
    const haDozeMinutos = new Date(Date.now() - 12 * 60_000).toISOString();
    api.detalheDoJogo.mockResolvedValue(detalhe({ dados: dados({ atualizadoEm: haDozeMinutos }) }));
    abrir();

    expect(await screen.findByText('Atualizado há 12 minutos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Steam' })).toBeInTheDocument();
  });

  it('data nula: "Nunca jogado"', async () => {
    api.detalheDoJogo.mockResolvedValue(
      detalhe({ dados: dados({ ultimaVezJogadoEm: null, minutosJogados: 0 }) }),
    );
    abrir(jogo({ dadosPlataforma: [dados({ ultimaVezJogadoEm: null, minutosJogados: 0 })] }));

    expect(await screen.findByText('Nunca jogado')).toBeInTheDocument();
    expect(screen.getByText('0 min')).toBeInTheDocument();
  });

  it('enquanto carrega mostra o último valor gravado e um esqueleto, sem pedir nada além do detalhe', async () => {
    let resolver: (valor: DetalheJogoPlataforma) => void = () => undefined;
    api.detalheDoJogo.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    abrir();

    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando conquistas' })).toBeInTheDocument();
    expect(api.detalheDoJogo).toHaveBeenCalledWith('STEAM', 'g1');

    resolver(detalhe());
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Carregando conquistas' })).toBeNull(),
    );
  });
});

describe('BlocoSteam — lista de conquistas (CA-52, CA-53)', () => {
  it('Desbloqueadas (fechada, mais recente primeiro) e Faltam (aberta, da mais comum à mais rara), com contagem', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    const { container } = abrir();
    await screen.findByText('42 h 30 min');

    const desbloqueadas = await waitFor(() => {
      const el = container.querySelector('details[data-lista="Desbloqueadas"]');
      expect(el).not.toBeNull();
      return el as HTMLDetailsElement;
    });
    const faltam = container.querySelector('details[data-lista="Faltam"]') as HTMLDetailsElement;

    expect(desbloqueadas.open).toBe(false);
    expect(faltam.open).toBe(true);
    expect(within(desbloqueadas).getByText('Desbloqueadas')).toBeInTheDocument();
    expect(within(desbloqueadas).getByText('2')).toBeInTheDocument();
    expect(within(faltam).getByText('Faltam')).toBeInTheDocument();
    expect(within(faltam).getByText('3')).toBeInTheDocument();
    const ordem = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('li[data-conquista]')).map((li) =>
        li.getAttribute('data-conquista'),
      );
    expect(ordem(desbloqueadas)).toEqual(['nova', 'velha']);
    expect(ordem(faltam)).toEqual(['comum', 'rara', 'segredo']);
  });

  it('cada item: nome, descrição, data, raridade; a oculta bloqueada mostra "Conquista oculta"; sem percentual, "Raridade indisponível"', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    const { container } = abrir();
    await screen.findByText('Desbloqueadas');

    const nova = container.querySelector('li[data-conquista="nova"]') as HTMLElement;
    expect(within(nova).getByText('Nome nova')).toBeInTheDocument();
    expect(within(nova).getByText('Descrição nova')).toBeInTheDocument();
    expect(within(nova).getByText('Desbloqueada em 17/02/2026')).toBeInTheDocument();
    expect(within(nova).getByText('12,4% dos jogadores')).toBeInTheDocument();

    const segredo = container.querySelector('li[data-conquista="segredo"]') as HTMLElement;
    expect(within(segredo).getByText('Conquista oculta')).toBeInTheDocument();
    expect(within(segredo).getByText('Raridade indisponível')).toBeInTheDocument();
    expect(within(segredo).queryByText(/Desbloqueada em/)).toBeNull();
  });

  it('os ícones têm width, height e loading="lazy", e a lista é uma coluna sem largura fixa (360 px)', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    const { container } = abrir();
    await screen.findByText('Faltam');

    const icones = Array.from(container.querySelectorAll('li[data-conquista] img'));
    expect(icones).toHaveLength(5);
    for (const icone of icones) {
      expect(icone).toHaveAttribute('width', '52');
      expect(icone).toHaveAttribute('height', '52');
      expect(icone).toHaveAttribute('loading', 'lazy');
      expect(icone).toHaveAttribute('alt', '');
      expect(icone).toHaveAttribute('referrerpolicy', 'no-referrer');
    }
    const item = container.querySelector('li[data-conquista="nova"]') as HTMLElement;
    // Cada item é uma linha (ícone, texto que cede, raridade) sem largura fixa; as listas ficam lado a lado só em lg.
    expect(item.className).toContain('min-w-0');
    expect(item.className).toContain('items-center');
    expect(container.innerHTML).not.toMatch(/overflow-x-|min-w-\[|w-\[\d{3,}px\]/);
  });

  it('nenhuma animação: só transição de cor nos botões (nada de animate-, duration- nem transform) (CA-55)', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    const { container } = abrir();
    await screen.findByText('Faltam');

    expect(container.innerHTML).not.toMatch(
      /animate-|duration-|transition-(?!colors)|transition(?!-colors)/,
    );
  });
});

describe('BlocoSteam — avisos (CA-47 a CA-50)', () => {
  it('jogo sem conquistas (400 "no stats", fixture real): sem barra e "Este jogo não tem conquistas" (CA-48)', async () => {
    api.detalheDoJogo.mockResolvedValue(
      detalhe({
        dados: dados({ conquistasTotal: 0, conquistasDesbloqueadas: 0 }),
        conquistas: [],
        aviso: 'SEM_CONQUISTAS',
      }),
    );
    abrir(jogo({ dadosPlataforma: [dados({ conquistasTotal: 0, conquistasDesbloqueadas: 0 })] }));

    expect(await screen.findByText('Este jogo não tem conquistas.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Desbloqueadas')).toBeNull();
  });

  it('(SIMULADO, sem fixture real) conquistas negadas: as horas ficam, aviso discreto, sem barra e sem o bloco de perfil privado (CA-47)', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe({ conquistas: [], aviso: 'CONQUISTAS_PRIVADAS' }));
    abrir();

    expect(await screen.findByText(/conquistas deste jogo estão privadas/)).toBeInTheDocument();
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Seu perfil Steam está privado/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  });

  it('(SIMULADO, sem fixture real) perfil privado no detalhe: valor gravado com aviso, nunca erro (CA-47)', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe({ conquistas: [], aviso: 'PERFIL_PRIVADO' }));
    abrir();

    expect(await screen.findByText(/Seu perfil Steam está privado agora/)).toBeInTheDocument();
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
    expect(screen.getByText('Conquistas · 12 de 40')).toBeInTheDocument();
  });

  it('Steam fora do ar: "Não foi possível atualizar agora" com o valor antigo (CA-49)', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe({ conquistas: [], aviso: 'INDISPONIVEL' }));
    abrir();

    expect(await screen.findByText(/Não foi possível atualizar agora/)).toBeInTheDocument();
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
    expect(screen.getByText('Conquistas · 12 de 40')).toBeInTheDocument();
  });

  it('falha de rede no detalhe: aviso e o valor gravado continuam na tela', async () => {
    api.detalheDoJogo.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    abrir();

    expect(
      await screen.findByText(/Não foi possível carregar as conquistas agora/),
    ).toBeInTheDocument();
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  });
});

describe('BlocoSteam — 100% das conquistas (CA-56)', () => {
  it('Atualizar que leva as conquistas a 100% comemora com o Chek', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    api.atualizarJogo.mockResolvedValue(
      detalhe({ dados: dados({ conquistasTotal: 40, conquistasDesbloqueadas: 40 }) }),
    );
    const { user } = abrir();
    await screen.findByText('Faltam');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() =>
      expect(avisosNaFila().some((aviso) => aviso.chek === 'comemorando')).toBe(true),
    );
    expect(avisosNaFila().find((aviso) => aviso.chek)?.texto).toContain('100%');
  });

  it('Atualizar sem chegar a 100% só avisa que atualizou', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    api.atualizarJogo.mockResolvedValue(
      detalhe({ dados: dados({ conquistasTotal: 40, conquistasDesbloqueadas: 20 }) }),
    );
    const { user } = abrir();
    await screen.findByText('Faltam');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(avisosNaFila()).toHaveLength(1));
    expect(avisosNaFila()[0]?.chek).toBeUndefined();
  });
});

describe('BlocoSteam — Atualizar e Desvincular', () => {
  it('Atualizar chama o POST, mostra "Atualizando…" e troca os dados', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    let resolver: (valor: DetalheJogoPlataforma) => void = () => undefined;
    api.atualizarJogo.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const { user } = abrir();
    await screen.findByText('Faltam');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    const pendente = await screen.findByRole('button', { name: 'Atualizando…' });
    expect(pendente).toBeDisabled();
    // O ícone gira só enquanto o pedido existe (CA-31).
    expect(pendente.querySelector('.gira')).not.toBeNull();
    resolver(detalhe({ dados: dados({ minutosJogados: 3000 }) }));

    expect(await screen.findByText('50 h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' }).querySelector('.gira')).toBeNull();
    expect(api.atualizarJogo).toHaveBeenCalledWith('STEAM', 'g1');
  });

  it('Atualizar com a Steam falhando (502): mensagem e o valor antigo fica', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    api.atualizarJogo.mockRejectedValue(erroHttp(502, 'PLATAFORMA_INDISPONIVEL'));
    const { user } = abrir();
    await screen.findByText('Faltam');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Não foi possível falar com a plataforma/,
    );
    expect(screen.getByText('42 h 30 min')).toBeInTheDocument();
  });

  it('Desvincular pede confirmação; Cancelar não chama nada; confirmar chama o DELETE do jogo (CA-54)', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    api.desvincularJogo.mockResolvedValue(undefined);
    const { user } = abrir();
    await screen.findByText('Faltam');

    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByText(/O título, o status, as notas e a capa continuam/),
    ).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(api.desvincularJogo).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desvincular' }),
    );

    await waitFor(() => expect(api.desvincularJogo).toHaveBeenCalledWith('STEAM', 'g1'));
  });

  it('jogo sem camada da Steam não renderiza nada nem pede o detalhe', () => {
    const { container } = abrir(jogo({ dadosPlataforma: [] }));

    expect(container).toBeEmptyDOMElement();
    expect(api.detalheDoJogo).not.toHaveBeenCalled();
  });
});
