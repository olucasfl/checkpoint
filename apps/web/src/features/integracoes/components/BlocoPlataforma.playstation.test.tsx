import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type Conquista,
  type DadosJogoPlataforma,
  type DetalheJogoPlataforma,
  type Game,
} from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integracoesApi } from '../api/integracoes-api';
import { SecoesDasPlataformas } from './SecoesDasPlataformas';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: {
    detalheDoJogo: vi.fn(),
    atualizarJogo: vi.fn(),
    desvincularJogo: vi.fn(),
    vincularComCredencial: vi.fn(),
  },
}));

const api = vi.mocked(integracoesApi);

// Dados sintéticos e óbvios (RULES.md §8). Os troféus são fictícios; nada é resposta real da Sony (spec, D6).
const psn = (extra: Partial<DadosJogoPlataforma> = {}): DadosJogoPlataforma => ({
  provedor: 'PLAYSTATION',
  idExterno: 'PPSA01234_00',
  minutosJogados: 600,
  ultimaVezJogadoEm: '2026-03-01T22:30:00.000Z',
  conquistasTotal: 6,
  conquistasDesbloqueadas: 3,
  capaUrl: null,
  atualizadoEm: new Date(Date.now() - 12 * 60_000).toISOString(),
  ...extra,
});

const steam = (): DadosJogoPlataforma => ({
  ...psn(),
  provedor: 'STEAM',
  idExterno: '504230',
  conquistasTotal: 40,
  conquistasDesbloqueadas: 12,
});

const jogo = (dadosPlataforma: DadosJogoPlataforma[]): Game => ({
  id: 'g1',
  titulo: 'Jogo Exemplo',
  plataforma: 'PS5',
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma,
});

const trofeu = (id: string, extra: Partial<Conquista>): Conquista => ({
  id,
  nome: `Troféu ${id}`,
  descricao: `Descrição ${id}`,
  oculta: false,
  desbloqueada: false,
  desbloqueadaEm: null,
  iconeUrl: null,
  raridadePercentual: 10,
  tipo: 'bronze',
  raridadeNivel: 'comum',
  ...extra,
});

const detalhe = (extra: Partial<DetalheJogoPlataforma> = {}): DetalheJogoPlataforma => ({
  dados: psn(),
  conquistas: [
    trofeu('ouro', {
      nome: 'Ouro Exemplo',
      tipo: 'ouro',
      desbloqueada: false,
      raridadePercentual: 4.8,
      raridadeNivel: 'raro',
    }),
    trofeu('prata', {
      nome: 'Prata Exemplo',
      tipo: 'prata',
      desbloqueada: true,
      desbloqueadaEm: '2026-02-01T10:00:00.000Z',
      raridadePercentual: 18.5,
    }),
    trofeu('segredo', { nome: '', descricao: null, oculta: true, tipo: 'bronze', iconeUrl: null }),
  ],
  aviso: null,
  porTipo: {
    platina: { total: 1, desbloqueados: 0 },
    ouro: { total: 1, desbloqueados: 0 },
    prata: { total: 1, desbloqueados: 1 },
    bronze: { total: 3, desbloqueados: 2 },
  },
  ...extra,
});

function abrir(game: Game) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SecoesDasPlataformas game={game} />
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('seção da PlayStation na página do jogo (CA-48 a CA-51)', () => {
  it('horas, último jogo, barra de troféus com nome acessível em texto, contagem por tipo, Atualizar e Desvincular; sem "Abrir na PlayStation"', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    abrir(jogo([psn()]));

    expect(await screen.findByText('Tempo jogado na PlayStation')).toBeInTheDocument();
    expect(screen.getByText('10 h')).toBeInTheDocument();
    expect(screen.getByText('Último jogo em')).toBeInTheDocument();
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAccessibleName('3 de 6 troféus');
    expect(screen.getByText('Troféus · 3 de 6')).toBeInTheDocument();
    const porTipo = await screen.findByRole('list', { name: 'Troféus por tipo' });
    expect(within(porTipo).getByText('Platina').parentElement).toHaveTextContent('Platina0 de 1');
    expect(within(porTipo).getByText('Ouro').parentElement).toHaveTextContent('Ouro0 de 1');
    expect(within(porTipo).getByText('Prata').parentElement).toHaveTextContent('Prata1 de 1');
    expect(within(porTipo).getByText('Bronze').parentElement).toHaveTextContent('Bronze2 de 3');
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir/ })).toBeNull();
    // A linha da seção fechada usa o vocabulário do cadastro.
    expect(screen.getByText('10 h · 3/6 troféus')).toBeInTheDocument();
  });

  it('as listas "Desbloqueadas (N)" e "Faltam (N)" nascem FECHADAS; cada troféu mostra tipo e raridade em TEXTO', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    const user = abrir(jogo([psn()]));
    await screen.findByRole('list', { name: 'Troféus por tipo' });

    const faltam = document.querySelector('details[data-lista="Faltam"]') as HTMLDetailsElement;
    const desbloqueadas = document.querySelector(
      'details[data-lista="Desbloqueadas"]',
    ) as HTMLDetailsElement;
    expect(faltam.open).toBe(false);
    expect(desbloqueadas.open).toBe(false);
    expect(within(faltam).getByText('2')).toBeInTheDocument();

    await user.click(within(faltam).getByText('Faltam'));
    await user.click(within(desbloqueadas).getByText('Desbloqueadas'));

    const ouro = faltam.querySelector('[data-conquista="ouro"]') as HTMLElement;
    expect(ouro).toHaveTextContent('Ouro Exemplo');
    expect(ouro).toHaveTextContent('Ouro'); // o tipo, em texto
    expect(ouro).toHaveTextContent('Raro · 4,8% dos jogadores');
    const prata = desbloqueadas.querySelector('[data-conquista="prata"]') as HTMLElement;
    expect(prata).toHaveTextContent('Prata');
    expect(prata).toHaveTextContent('Comum · 18,5% dos jogadores');
    expect(prata).toHaveTextContent('Desbloqueada em 01/02/2026');
  });

  it('troféu OCULTO e bloqueado mostra "Troféu oculto" (sem nome nem descrição); nada de "Conquista oculta"', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    const user = abrir(jogo([psn()]));
    await screen.findByRole('list', { name: 'Troféus por tipo' });
    await user.click(screen.getByText('Faltam'));

    const segredo = document.querySelector('[data-conquista="segredo"]') as HTMLElement;

    expect(segredo).toHaveTextContent('Troféu oculto');
    expect(segredo).not.toHaveTextContent('Conquista oculta');
    expect(segredo).not.toHaveTextContent('Descrição segredo');
  });

  it('jogo ligado à Steam E à PlayStation: duas seções na ordem do cadastro, cada uma com o vocabulário dela (CA-50)', async () => {
    api.detalheDoJogo.mockImplementation((provedor) =>
      Promise.resolve(
        provedor === 'STEAM' ? { dados: steam(), conquistas: [], aviso: null } : detalhe(),
      ),
    );
    abrir(jogo([psn(), steam()]));

    const secoes = await screen.findAllByRole('heading', { level: 2 });
    await screen.findByText('Tempo jogado na PlayStation');
    await screen.findByText('Tempo jogado na Steam');

    const ordem = Array.from(document.querySelectorAll('[data-secao]')).map((secao) =>
      secao.getAttribute('data-secao'),
    );
    expect(ordem).toEqual(['steam', 'playstation']);
    expect(screen.getByText('Conquistas · 12 de 40')).toBeInTheDocument();
    expect(screen.getByText('Troféus · 3 de 6')).toBeInTheDocument();
    expect(secoes.length).toBeGreaterThanOrEqual(2);
  });

  it('sem troféus lidos: o aviso do console (só aparecem depois que o console sincroniza)', async () => {
    api.detalheDoJogo.mockResolvedValue({
      dados: psn({ conquistasTotal: 0, conquistasDesbloqueadas: 0 }),
      conquistas: [],
      aviso: 'SEM_CONQUISTAS',
      porTipo: null,
    });
    abrir(jogo([psn({ conquistasTotal: 0, conquistasDesbloqueadas: 0 })]));

    expect(
      await screen.findByText(/Os troféus só aparecem depois que o console sincroniza com a PSN/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Troféus por tipo' })).toBeNull();
  });

  it('conexão expirada (REAUTENTICAR): o gravado continua, o aviso com o Chek e o botão Reconectar abre o formulário do NPSSO (CA-51)', async () => {
    api.detalheDoJogo.mockResolvedValue({
      dados: psn(),
      conquistas: [],
      aviso: 'REAUTENTICAR',
      porTipo: null,
    });
    const user = abrir(jogo([psn()]));

    expect(await screen.findByText(/Sua conexão com a PlayStation expirou/)).toBeInTheDocument();
    expect(screen.getByText('Tempo jogado na PlayStation')).toBeInTheDocument();
    expect(screen.getByText('10 h')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reconectar' }));

    const dialogo = await screen.findByRole('dialog', { name: /Reconectar PlayStation/ });
    expect(within(dialogo).getByLabelText('NPSSO')).toHaveAttribute('type', 'password');
  });

  it('Desvincular pede confirmação com o texto do cadastro e chama a API só para a PlayStation', async () => {
    api.detalheDoJogo.mockResolvedValue(detalhe());
    api.desvincularJogo.mockResolvedValue(undefined);
    const user = abrir(jogo([psn()]));
    await screen.findByText('Tempo jogado na PlayStation');

    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    const dialogo = await screen.findByRole('dialog', { name: /Desvincular da PlayStation/ });

    expect(dialogo).toHaveTextContent('as horas e os troféus da PlayStation');
    await user.click(within(dialogo).getByRole('button', { name: 'Desvincular' }));
    expect(api.desvincularJogo).toHaveBeenCalledWith('PLAYSTATION', 'g1');
  });
});
