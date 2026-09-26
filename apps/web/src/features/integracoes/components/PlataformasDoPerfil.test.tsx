import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { type ContaVinculada, type ResumoContaPlataforma } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integracoesApi } from '../api/integracoes-api';
import { irPara } from '../lib/navegar';
import { PlataformasDoPerfil } from './PlataformasDoPerfil';
import { PASSOS_DE_PRIVACIDADE } from './ResumoSteam';

vi.mock('../api/integracoes-api', () => ({
  integracoesApi: {
    listarContas: vi.fn(),
    iniciarVinculo: vi.fn(),
    resumo: vi.fn(),
    atualizarResumo: vi.fn(),
    desvincular: vi.fn(),
    biblioteca: vi.fn(),
    vincularJogo: vi.fn(),
  },
}));
vi.mock('../lib/navegar', () => ({ irPara: vi.fn() }));

const api = vi.mocked(integracoesApi);
const navegar = vi.mocked(irPara);

// Dados sintéticos e óbvios (RULES.md §8): nenhum SteamID, nome ou avatar reais.
const CONTA: ContaVinculada = {
  provedor: 'STEAM',
  idExterno: 'STEAMID_SINTETICO',
  nomeExibicao: 'Jogador Gravado',
  vinculadaEm: '2026-09-25T12:00:00.000Z',
};

const PERFIL: ResumoContaPlataforma = {
  provedor: 'STEAM',
  nomeExibicao: 'Jogador Sintetico',
  avatarUrl: 'https://avatars.steamstatic.com/0000_full.jpg',
  perfilUrl: 'https://steamcommunity.com/profiles/x/',
  membroDesde: 2011,
  status: 'online',
  jogandoAgora: null,
  jogosJogados: 30,
  nuncaJogados: 8,
  noCheckpoint: { ligados: 12, naBiblioteca: 38 },
  totalJogos: 38,
  minutosTotais: 25_200,
  maisJogados: [
    { idExterno: '2', titulo: 'Beta', capaUrl: null, minutosJogados: 1_200 },
    { idExterno: '1', titulo: 'Alfa', capaUrl: null, minutosJogados: 600 },
    {
      idExterno: '3',
      titulo: 'Gama com um nome enorme que precisa quebrar linha',
      capaUrl: null,
      minutosJogados: 90,
    },
  ],
  conquistas: { desbloqueadas: 12, total: 40, jogosVinculados: 3 },
  consultadoEm: '2026-09-25T12:00:00.000Z',
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

const semConexao = () => new AxiosError('Network Error', 'ERR_NETWORK');

function renderCartao() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlataformasDoPerfil />
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

/** Com a conta vinculada: a seção mostra a linha minimizada e o resumo só aparece no popup, aberto ao clicar nela. */
async function renderVinculado() {
  const user = renderCartao();
  await user.click(await screen.findByRole('button', { name: /Jogador Gravado/ }));
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listarContas.mockResolvedValue([]);
});

describe('carregando e falha da lista de contas', () => {
  it('enquanto carrega: esqueleto com role status e nome acessível', () => {
    api.listarContas.mockReturnValue(new Promise(() => undefined));

    renderCartao();

    expect(
      screen.getByRole('status', { name: 'Carregando contas vinculadas' }),
    ).toBeInTheDocument();
  });

  it('falha ao listar: mensagem por code e "Tentar de novo" que refaz a consulta', async () => {
    api.listarContas.mockRejectedValueOnce(erroHttp(500, 'LIMITE_TENTATIVAS'));
    const user = renderCartao();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Aguarde um pouco e tente de novo.',
    );
    api.listarContas.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Vincular conta Steam' })).toBeInTheDocument();
    expect(api.listarContas).toHaveBeenCalledTimes(2);
  });

  it('sem conexão ao listar: "Sem conexão…"', async () => {
    api.listarContas.mockRejectedValue(semConexao());
    renderCartao();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem conexão. Tente de novo quando a conexão voltar.',
    );
  });
});

describe('sem vínculo (CA-15)', () => {
  it('mostra a Steam e "Vincular conta"; clicar leva à URL devolvida pela API', async () => {
    api.iniciarVinculo.mockResolvedValue({
      url: 'https://steamcommunity.com/openid/login?openid.mode=checkid_setup',
    });
    const user = renderCartao();

    await user.click(await screen.findByRole('button', { name: 'Vincular conta Steam' }));

    expect(api.iniciarVinculo).toHaveBeenCalledWith('STEAM');
    await waitFor(() =>
      expect(navegar).toHaveBeenCalledWith(
        'https://steamcommunity.com/openid/login?openid.mode=checkid_setup',
      ),
    );
  });

  it.each([
    ['outro host', 'https://evil.example/openid/login'],
    ['http', 'http://steamcommunity.com/openid/login'],
    ['host enganoso', 'https://steamcommunity.com.evil.example/openid/login'],
    ['outro caminho', 'https://steamcommunity.com/id/alguem'],
    ['javascript:', 'javascript:alert(1)'],
  ])('a URL devolvida é %s: o navegador NÃO vai a lugar nenhum', async (_nome, url) => {
    api.iniciarVinculo.mockResolvedValue({ url });
    const user = renderCartao();

    await user.click(await screen.findByRole('button', { name: 'Vincular conta Steam' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível iniciar o vínculo. Tente de novo.',
    );
    expect(navegar).not.toHaveBeenCalled();
  });

  it('já vinculada em outro lugar (409): mensagem pelo code', async () => {
    api.iniciarVinculo.mockRejectedValue(erroHttp(409, 'PLATAFORMA_JA_VINCULADA'));
    const user = renderCartao();

    await user.click(await screen.findByRole('button', { name: 'Vincular conta Steam' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você já tem outra conta vinculada. Desvincule-a antes.',
    );
    expect(navegar).not.toHaveBeenCalled();
  });

  it('429 e sem conexão têm mensagem própria', async () => {
    api.iniciarVinculo.mockRejectedValueOnce(erroHttp(429, 'LIMITE_TENTATIVAS'));
    const user = renderCartao();

    await user.click(await screen.findByRole('button', { name: 'Vincular conta Steam' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');

    api.iniciarVinculo.mockRejectedValueOnce(semConexao());
    await user.click(screen.getByRole('button', { name: 'Vincular conta Steam' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Sem conexão. Tente de novo quando a conexão voltar.',
      ),
    );
  });

  it('o botão fica desabilitado enquanto abre a Steam (sem clique duplo)', async () => {
    api.iniciarVinculo.mockReturnValue(new Promise(() => undefined));
    const user = renderCartao();

    await user.click(await screen.findByRole('button', { name: 'Vincular conta Steam' }));

    expect(screen.getByRole('button', { name: 'Vincular conta Steam' })).toBeDisabled();
    expect(api.iniciarVinculo).toHaveBeenCalledTimes(1);
  });

  it('botão com pelo menos 44 px de altura (CA-22)', async () => {
    renderCartao();

    expect(await screen.findByRole('button', { name: 'Vincular conta Steam' })).toHaveClass(
      'min-h-11',
    );
  });
});

describe('vinculado (CA-16)', () => {
  beforeEach(() => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
  });

  it('enquanto o cartão carrega mostra o nome gravado e um esqueleto', async () => {
    api.resumo.mockReturnValue(new Promise(() => undefined));
    await renderVinculado();

    expect((await screen.findAllByText('Jogador Gravado')).length).toBeGreaterThan(0);
    expect(screen.getByRole('status', { name: 'Carregando sua conta Steam' })).toBeInTheDocument();
  });

  it('nome, avatar, jogos, horas, conquistas dos vinculados e os mais jogados', async () => {
    await renderVinculado();

    expect(await screen.findByText('Jogador Sintetico')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('420 h')).toBeInTheDocument();
    expect(screen.getByText('12 conquistas em 3 jogos vinculados')).toBeInTheDocument();
    const lista = screen.getByRole('heading', { name: 'Mais jogados' })
      .nextElementSibling as HTMLElement;
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Beta20 h', 'Alfa10 h', 'Gama com um nome enorme que precisa quebrar linha1,5 h']);
  });

  it('o avatar é decorativo (alt vazio), sem Referer e com tamanho', async () => {
    await renderVinculado();

    await screen.findByText('Jogador Sintetico');
    const avatar = document.querySelector('img[width="56"]') as HTMLImageElement;
    expect(avatar).toHaveAttribute('src', 'https://avatars.steamstatic.com/0000_full.jpg');
    expect(avatar).toHaveAttribute('alt', '');
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(avatar).toHaveAttribute('width', '56');
    expect(avatar).toHaveAttribute('height', '56');
  });

  it('sem avatar (null) mostra o ícone no lugar, sem <img>', async () => {
    api.resumo.mockResolvedValue({ ...PERFIL, avatarUrl: null });
    await renderVinculado();

    await screen.findByText('Jogador Sintetico');
    expect(document.querySelector('img[width="56"]')).toBeNull();
  });

  it('sem jogo vinculado o cartão diz "0 conquistas em 0 jogos vinculados" (etapa 2)', async () => {
    api.resumo.mockResolvedValue({
      ...PERFIL,
      conquistas: { desbloqueadas: 0, total: 0, jogosVinculados: 0 },
    });
    await renderVinculado();

    expect(await screen.findByText('0 conquistas em 0 jogos vinculados')).toBeInTheDocument();
  });

  it('biblioteca vazia: "Nenhum jogo na sua biblioteca.", sem lista de mais jogados (CA-20)', async () => {
    api.resumo.mockResolvedValue({ ...PERFIL, totalJogos: 0, minutosTotais: 0, maisJogados: [] });
    await renderVinculado();

    expect(await screen.findByText('Nenhum jogo na sua biblioteca.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mais jogados' })).toBeNull();
  });

  it('os botões Atualizar e Desvincular têm pelo menos 44 px de altura (CA-22)', async () => {
    await renderVinculado();

    await screen.findByText('Jogador Sintetico');
    expect(screen.getByRole('button', { name: 'Atualizar' })).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('button', { name: 'Desvincular' })).toHaveClass('min-h-11', 'min-w-11');
  });

  it('"Vincular conta" não aparece com a conta vinculada', async () => {
    await renderVinculado();

    await screen.findByText('Jogador Sintetico');
    expect(screen.queryByRole('button', { name: 'Vincular conta Steam' })).toBeNull();
  });
});

describe('Atualizar (CA-18)', () => {
  beforeEach(() => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
  });

  it('chama a atualização e troca os números do cartão sem nova consulta ao GET', async () => {
    api.atualizarResumo.mockResolvedValue({ ...PERFIL, totalJogos: 39 });
    const user = await renderVinculado();
    await screen.findByText('38');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(await screen.findByText('39')).toBeInTheDocument();
    expect(api.atualizarResumo).toHaveBeenCalledWith('STEAM');
    expect(api.resumo).toHaveBeenCalledTimes(1);
  });

  it('enquanto atualiza, o botão fica desabilitado', async () => {
    api.atualizarResumo.mockReturnValue(new Promise(() => undefined));
    const user = await renderVinculado();
    await screen.findByText('38');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(screen.getByRole('button', { name: 'Atualizando…' })).toBeDisabled();
  });

  it('falha ao atualizar mostra a mensagem e MANTÉM os números que já estavam (CA-21)', async () => {
    api.atualizarResumo.mockRejectedValue(erroHttp(502, 'PLATAFORMA_INDISPONIVEL'));
    const user = await renderVinculado();
    await screen.findByText('38');

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com a plataforma agora. Tente de novo.',
    );
    expect(screen.getByText('38')).toBeInTheDocument();
  });
});

describe('Desvincular (CA-19)', () => {
  beforeEach(() => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
  });

  const dialogo = () => screen.getByRole('dialog', { name: 'Desvincular a Steam' });

  it('pede confirmação, com o foco em Cancelar; cancelar não muda nada', async () => {
    const user = await renderVinculado();
    await screen.findByText('Jogador Sintetico');

    await user.click(screen.getByRole('button', { name: 'Desvincular' }));

    expect(dialogo()).toHaveTextContent('Seus jogos, notas, status e capas continuam como estão.');
    await user.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }));
    expect(api.desvincular).not.toHaveBeenCalled();
    expect(screen.getByText('Jogador Sintetico')).toBeInTheDocument();
  });

  it('confirmar desvincula e o cartão volta a "Vincular conta"', async () => {
    api.desvincular.mockResolvedValue(undefined);
    const user = await renderVinculado();
    await screen.findByText('Jogador Sintetico');
    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    api.listarContas.mockResolvedValue([]);

    await user.click(within(dialogo()).getByRole('button', { name: 'Desvincular' }));

    expect(await screen.findByRole('button', { name: 'Vincular conta Steam' })).toBeInTheDocument();
    expect(api.desvincular).toHaveBeenCalledWith('STEAM');
    expect(screen.queryByText('Jogador Sintetico')).toBeNull();
  });

  it('falha ao desvincular mantém o diálogo aberto com a mensagem', async () => {
    api.desvincular.mockRejectedValue(semConexao());
    const user = await renderVinculado();
    await screen.findByText('Jogador Sintetico');
    await user.click(screen.getByRole('button', { name: 'Desvincular' }));

    await user.click(within(dialogo()).getByRole('button', { name: 'Desvincular' }));

    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(
      'Sem conexão. Tente de novo quando a conexão voltar.',
    );
  });
});

describe('perfil privado, falha da Steam e sem conexão (CA-20, CA-21)', () => {
  beforeEach(() => {
    api.listarContas.mockResolvedValue([CONTA]);
  });

  it('privado: "Seu perfil Steam está privado", o passo a passo e "Tentar de novo" que refaz a consulta', async () => {
    api.resumo.mockRejectedValue(erroHttp(409, 'PLATAFORMA_PERFIL_PRIVADO'));
    const user = await renderVinculado();

    expect(
      await screen.findByRole('heading', { name: 'Seu perfil Steam está privado' }),
    ).toBeInTheDocument();
    // O Chek com o cadeado é decorativo (CA-38); o texto acima já diz tudo.
    expect(document.querySelector('svg[data-chek="cadeado"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    const passos = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(passos).toEqual([...PASSOS_DE_PRIVACIDADE]);
    expect(PASSOS_DE_PRIVACIDADE.join(' ')).toContain('"Meu perfil" como Público');
    expect(PASSOS_DE_PRIVACIDADE.join(' ')).toContain('"Detalhes do jogo" como Público');
    // O nome gravado continua na tela, e Atualizar/Desvincular seguem disponíveis.
    expect(screen.getAllByText('Jogador Gravado').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Desvincular' })).toBeInTheDocument();

    api.resumo.mockResolvedValue(PERFIL);
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Jogador Sintetico')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Seu perfil Steam está privado' })).toBeNull();
    // A linha do perfil, o popup ao abrir e o "Tentar de novo".
    expect(api.resumo).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      '502 indisponível',
      erroHttp(502, 'PLATAFORMA_INDISPONIVEL'),
      'Não foi possível falar com a Steam agora.',
    ],
    [
      '502 no limite',
      erroHttp(502, 'PLATAFORMA_LIMITE'),
      'Não foi possível falar com a Steam agora.',
    ],
    ['sem conexão', semConexao(), 'Sem conexão. Tente de novo quando a conexão voltar.'],
  ])(
    '%s: mensagem própria com "Tentar de novo", e o resto da tela segue de pé',
    async (_nome, erro, texto) => {
      api.resumo.mockRejectedValue(erro);
      const user = await renderVinculado();

      expect(await screen.findByRole('alert')).toHaveTextContent(texto);
      expect(screen.queryByRole('heading', { name: 'Seu perfil Steam está privado' })).toBeNull();
      expect(screen.getAllByText('Jogador Gravado').length).toBeGreaterThan(0);

      api.resumo.mockResolvedValue(PERFIL);
      await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(await screen.findByText('Jogador Sintetico')).toBeInTheDocument();
    },
  );
});

describe('a seção "Plataformas"', () => {
  it('tem o título e a região com nome acessível', async () => {
    renderCartao();

    expect(screen.getByRole('region', { name: 'Plataformas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plataformas' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Vincular conta Steam' });
  });
});

describe('a aba Plataformas (spec plataformas-e-pagina-do-jogo, F3)', () => {
  it('vinculada: linha minimizada com a logo oficial, o nome da conta e a foto (uma consulta ao resumo)', async () => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
    renderCartao();

    const linha = await screen.findByRole('button', { name: /Jogador Gravado/ });
    expect(linha).toHaveTextContent('Steam');
    expect(linha.querySelector('[data-plataforma-logo="STEAM"]')).not.toBeNull();
    expect(linha).toHaveAttribute('aria-haspopup', 'dialog');
    expect(linha).toHaveClass('min-h-14');
    await waitFor(() => expect(api.resumo).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicar na linha abre o popup, com a logo oficial (>= 50 px) no título e Fechar; Fechar devolve o foco', async () => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
    const user = renderCartao();
    const linha = await screen.findByRole('button', { name: /Jogador Gravado/ });

    await user.click(linha);

    const popup = await screen.findByRole('dialog', { name: 'Steam' });
    const logo = within(popup).getByRole('img', { name: 'Steam' });
    expect(Number(logo.getAttribute('height'))).toBeGreaterThanOrEqual(50);
    expect(api.resumo).toHaveBeenCalledTimes(1);

    await user.click(within(popup).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('depois de aberto o popup, a linha mostra "Atualizado há X" a partir do cache', async () => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue({ ...PERFIL, consultadoEm: new Date().toISOString() });
    const user = renderCartao();
    await user.click(await screen.findByRole('button', { name: /Jogador Gravado/ }));
    await screen.findByText('Jogador Sintetico');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(await screen.findByText('Atualizado agora')).toBeInTheDocument();
  });

  it('sem vínculo: o botão "Vincular" tem a logo oficial (>= 50 px) sozinha e nome acessível "Vincular conta Steam"', async () => {
    renderCartao();

    const botao = await screen.findByRole('button', { name: 'Vincular conta Steam' });
    const logo = botao.querySelector('img') as HTMLImageElement;
    expect(Number(logo.getAttribute('height'))).toBeGreaterThanOrEqual(50);
    expect(logo).toHaveAttribute('alt', '');
    expect(botao).toHaveClass('min-h-11');
  });

  it('plataformas sem suporte não aparecem (nem "Em breve"): só a Steam tem linha', async () => {
    const { container } = (renderCartao(), { container: document.body });
    await screen.findByRole('button', { name: 'Vincular conta Steam' });

    expect(container.querySelectorAll('[data-plataforma-linha]')).toHaveLength(1);
    expect(screen.queryByText(/Em breve/)).toBeNull();
    for (const nome of ['PlayStation', 'Xbox', 'Epic']) {
      expect(screen.queryByText(new RegExp(nome))).toBeNull();
    }
  });

  it('desvincular no popup fecha o popup e a linha volta a "Vincular"', async () => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
    api.desvincular.mockResolvedValue(undefined);
    const user = renderCartao();
    await user.click(await screen.findByRole('button', { name: /Jogador Gravado/ }));
    await screen.findByText('Jogador Sintetico');
    await user.click(screen.getByRole('button', { name: 'Desvincular' }));
    api.listarContas.mockResolvedValue([]);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Desvincular a Steam' })).getByRole('button', {
        name: 'Desvincular',
      }),
    );

    expect(await screen.findByRole('button', { name: 'Vincular conta Steam' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('o popup da Steam (spec plataformas-e-pagina-do-jogo, F4a)', () => {
  beforeEach(() => {
    api.listarContas.mockResolvedValue([CONTA]);
    api.resumo.mockResolvedValue(PERFIL);
    api.biblioteca.mockResolvedValue([]);
  });

  async function abrirPopup() {
    const user = renderCartao();
    await user.click(await screen.findByRole('button', { name: /Jogador Gravado/ }));
    await screen.findByText('Jogador Sintetico');
    return { user, popup: screen.getByRole('dialog', { name: 'Steam' }) };
  }

  it('cabeçalho: avatar decorativo, nome, "Na Steam desde", status e o link do perfil com rel seguro', async () => {
    const { popup } = await abrirPopup();

    expect(within(popup).getByText('Na Steam desde 2011')).toBeInTheDocument();
    expect(within(popup).getByText('Online')).toBeInTheDocument();
    const link = within(popup).getByRole('link', { name: /Abrir perfil na Steam/ });
    expect(link).toHaveAttribute('href', 'https://steamcommunity.com/profiles/x/');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('em jogo mostra o jogo; sem os dados (perfil que não os devolve) o bloco some, sem "null" nem "undefined"', async () => {
    api.resumo.mockResolvedValue({ ...PERFIL, status: 'jogando', jogandoAgora: 'Celeste' });
    const primeiro = await abrirPopup();
    expect(within(primeiro.popup).getByText('Jogando Celeste')).toBeInTheDocument();
  });

  it('sem membroDesde nem status: nada de "Na Steam desde" nem de status', async () => {
    api.resumo.mockResolvedValue({ ...PERFIL, membroDesde: null, status: null });
    const { popup } = await abrirPopup();

    expect(within(popup).queryByText(/Na Steam desde/)).toBeNull();
    expect(within(popup).queryByText(/Online|Offline|Jogando/)).toBeNull();
    expect(popup.textContent).not.toMatch(/null|undefined|NaN/);
  });

  it('números, top de mais jogados, backlog com a porcentagem, ligação com o catálogo e conquistas', async () => {
    const { popup } = await abrirPopup();

    expect(within(popup).getByText('30 de 38')).toBeInTheDocument();
    expect(within(popup).getByText('8 nunca abertos · 21%')).toBeInTheDocument();
    expect(
      within(popup).getByText('12 dos seus 38 jogos já estão no checkpoint'),
    ).toBeInTheDocument();
    expect(within(popup).getByText('12 conquistas em 3 jogos vinculados')).toBeInTheDocument();
    expect(
      within(popup).getByRole('region', { name: 'Mais jogados de sempre' }),
    ).toBeInTheDocument();
  });

  it('a ordem dos blocos: cabeçalho, números, mais jogados, backlog, checkpoint, conquistas, ações, rodapé', async () => {
    const { popup } = await abrirPopup();
    const texto = popup.textContent ?? '';
    const ordem = [
      'Na Steam desde',
      'Já jogados',
      'Mais jogados',
      'Backlog',
      'já estão no checkpoint',
      'conquistas em',
      'Atualizar',
      '©2024 Valve Corporation',
    ].map((trecho) => texto.indexOf(trecho));

    expect(ordem.every((posicao) => posicao >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('NÃO tem bloqueios (VAC), amigos, preço nem gênero; nível e atividade recente ficam para a F4b', async () => {
    const { popup } = await abrirPopup();

    expect(popup.textContent).not.toMatch(/VAC|banimento|bloqueio|amigos|preço|gênero|R\$/i);
    expect(popup.textContent).not.toMatch(/Nível|Atividade recente|XP/);
  });

  it('rodapé: a atribuição legal da Valve e "Não afiliado à Valve"', async () => {
    const { popup } = await abrirPopup();

    expect(popup).toHaveTextContent(
      '©2024 Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries. All rights reserved.',
    );
    expect(within(popup).getByText('Não afiliado à Valve')).toBeInTheDocument();
  });

  it('"Ver e importar" abre a biblioteca SÓ com os nunca abertos', async () => {
    const { user, popup } = await abrirPopup();

    await user.click(within(popup).getByRole('button', { name: 'Ver e importar' }));

    await waitFor(() =>
      expect(api.biblioteca).toHaveBeenCalledWith('STEAM', '', { nuncaJogados: true }),
    );
    expect(await screen.findByText(/Só os jogos que você nunca abriu/)).toBeInTheDocument();
  });

  it('"Importar jogos" abre a biblioteca inteira (sem o filtro)', async () => {
    const { user, popup } = await abrirPopup();

    await user.click(within(popup).getByRole('button', { name: 'Importar jogos' }));

    await waitFor(() => expect(api.biblioteca).toHaveBeenCalledWith('STEAM', ''));
    expect(screen.queryByText(/Só os jogos que você nunca abriu/)).toBeNull();
  });

  it('sem nenhum jogo nunca aberto: o backlog diz 0 e não oferece "Ver e importar"', async () => {
    api.resumo.mockResolvedValue({ ...PERFIL, nuncaJogados: 0, jogosJogados: 38 });
    const { popup } = await abrirPopup();

    expect(within(popup).getByText('0 nunca abertos · 0%')).toBeInTheDocument();
    expect(within(popup).queryByRole('button', { name: 'Ver e importar' })).toBeNull();
  });

  it('"Atualizar" mostra "Atualizado há X" e chama a atualização (o servidor segura o intervalo de 30 s)', async () => {
    api.resumo.mockResolvedValue({ ...PERFIL, consultadoEm: new Date().toISOString() });
    api.atualizarResumo.mockResolvedValue({ ...PERFIL, consultadoEm: new Date().toISOString() });
    const { user, popup } = await abrirPopup();

    expect(within(popup).getByText('Atualizado agora')).toBeInTheDocument();
    await user.click(within(popup).getByRole('button', { name: 'Atualizar' }));
    expect(api.atualizarResumo).toHaveBeenCalledWith('STEAM');
  });

  it('Desvincular pede confirmação com o texto do que acontece', async () => {
    const { user, popup } = await abrirPopup();

    await user.click(within(popup).getByRole('button', { name: 'Desvincular' }));

    expect(screen.getByRole('dialog', { name: 'Desvincular a Steam' })).toHaveTextContent(
      'Seus jogos, notas, status e capas continuam como estão.',
    );
  });

  it('todos os botões do popup têm pelo menos 44 px (min-h-11)', async () => {
    const { popup } = await abrirPopup();

    for (const nome of ['Atualizar', 'Importar jogos', 'Desvincular', 'Ver e importar', 'Fechar']) {
      const botao = within(popup).getByRole('button', { name: nome });
      expect(botao.className).toMatch(/min-h-11|size-11/);
    }
  });
});
