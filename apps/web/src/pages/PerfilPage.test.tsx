import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { type Game, type Usuario } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entrar, getSession, resetSessionForTests } from '@/features/auth/session/session';
import { authApi } from '@/features/auth/api/auth-api';
import { gamesApi } from '@/features/games/api/games-api';
import { integracoesApi } from '@/features/integracoes/api/integracoes-api';
import { perfilApi } from '@/features/perfil/api/perfil-api';
import { coverBackground } from '@/shared/lib/game-cover';
import { definirUsuario, resetPrefsForTests } from '@/shared/lib/prefs/prefs-store';
import { storage } from '@/shared/lib/storage/storage';
import { ehSafariIos, estaInstalado } from '@/shared/lib/pwa/display';
import { pedirInstalacao, podeInstalar } from '@/shared/lib/pwa/install-prompt';
import { PerfilPage } from './PerfilPage';

vi.mock('@/features/auth/api/auth-api', () => ({ authApi: { logout: vi.fn() } }));
vi.mock('@/features/games/api/games-api', () => ({ gamesApi: { list: vi.fn() } }));
vi.mock('@/features/perfil/api/perfil-api', () => ({
  perfilApi: {
    atualizar: vi.fn(),
    listarSessoes: vi.fn(),
    encerrarSessao: vi.fn(),
    encerrarOutrasSessoes: vi.fn(),
  },
}));
vi.mock('@/features/integracoes/api/integracoes-api', () => ({
  integracoesApi: {
    listarContas: vi.fn(),
    iniciarVinculo: vi.fn(),
    perfil: vi.fn(),
    atualizarPerfil: vi.fn(),
    desvincular: vi.fn(),
  },
}));
vi.mock('@/shared/lib/pwa/install-prompt', () => ({
  podeInstalar: vi.fn(),
  pedirInstalacao: vi.fn(),
  assinar: vi.fn(() => () => undefined),
}));
vi.mock('@/shared/lib/pwa/display', () => ({ estaInstalado: vi.fn(), ehSafariIos: vi.fn() }));

const games = vi.mocked(gamesApi);
const perfil = vi.mocked(perfilApi);
const integracoes = vi.mocked(integracoesApi);
const auth = vi.mocked(authApi);

const ANA: Usuario = {
  id: 'u1',
  nome: 'Ana Teste',
  email: 'ana@exemplo.com',
  criadoEm: '2026-09-24T12:00:00.000Z',
};

const jogo = (id: string, status: Game['status']): Game => ({
  id,
  titulo: `Jogo ${id}`,
  plataforma: null,
  status,
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-24T12:00:00.000Z',
  atualizadoEm: '2026-09-24T12:00:00.000Z',
});

/** Mostra a query da URL atual, para provar que o aviso do retorno da Steam a limpa. */
function UrlAtual() {
  // `<span>` e não `<output>`: o `<output>` tem `role="status"` implícito e confundiria as outras buscas.
  return <span data-testid="url-atual">{useLocation().search}</span>;
}

function renderPerfil(entrada = '/perfil') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entrada]}>
        <PerfilPage />
        <UrlAtual />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ applyAccept: false });
}

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

const cabecalho = () => screen.getByRole('region', { name: 'Resumo da conta' });
const editar = () => screen.getByRole('button', { name: 'Editar nome' });

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  entrar({ accessToken: 'token', usuario: ANA });
  games.list.mockResolvedValue([jogo('1', 'ZERADO'), jogo('2', 'JOGANDO'), jogo('3', 'JOGANDO')]);
  perfil.listarSessoes.mockResolvedValue([]);
  integracoes.listarContas.mockResolvedValue([]);
  vi.mocked(podeInstalar).mockReturnValue(false);
  vi.mocked(ehSafariIos).mockReturnValue(false);
  vi.mocked(estaInstalado).mockReturnValue(false);
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
  // No app, o PrefsSync faz isto quando a sessão resolve.
  definirUsuario(ANA.id);
});

describe('cabeçalho (CA-01)', () => {
  it('avatar de iniciais, nome, e-mail com a legenda, "Membro desde" e o resumo do catálogo', async () => {
    renderPerfil();

    const header = cabecalho();
    const avatar = header.querySelector('[data-avatar]');
    expect(avatar).toHaveTextContent('AT');
    expect(avatar).toHaveClass(coverBackground('Ana Teste'));
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(within(header).getByRole('heading', { name: 'Ana Teste' })).toBeInTheDocument();
    expect(within(header).getByText('ana@exemplo.com')).toBeInTheDocument();
    expect(within(header).getByText('(não verificado — usado só para entrar)')).toBeInTheDocument();
    expect(within(header).getByText('Membro desde setembro de 2026')).toBeInTheDocument();
    expect(
      await within(header).findByText('3 jogos · 1 zerado · 2 jogando · 0 quero jogar'),
    ).toBeInTheDocument();
  });

  it('enquanto a lista de jogos carrega, o resumo é "—"', () => {
    games.list.mockReturnValue(new Promise(() => undefined));
    renderPerfil();

    expect(cabecalho().querySelector('[data-resumo]')).toHaveTextContent(/^—$/);
  });

  it('o resumo usa a MESMA query do catálogo: uma chamada à lista, nenhum endpoint novo', async () => {
    renderPerfil();

    await within(cabecalho()).findByText(/3 jogos/);
    expect(games.list).toHaveBeenCalledTimes(1);
  });

  it('o nome e o e-mail aparecem uma vez só na tela', () => {
    renderPerfil();

    expect(screen.getAllByText('Ana Teste')).toHaveLength(1);
    expect(screen.getAllByText('ana@exemplo.com')).toHaveLength(1);
  });
});

describe('nome editável (CA-04)', () => {
  it('Editar abre o campo com o nome atual e o foco nele', async () => {
    const user = renderPerfil();

    await user.click(editar());

    const campo = screen.getByLabelText('Nome');
    expect(campo).toHaveValue('Ana Teste');
    expect(campo).toHaveFocus();
  });

  it('salvar manda o nome aparado, troca o nome na tela e na sessão sem recarregar', async () => {
    perfil.atualizar.mockResolvedValue({ ...ANA, nome: 'Ana Souza' });
    const user = renderPerfil();

    await user.click(editar());
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), '  Ana Souza {Enter}');

    expect(perfil.atualizar).toHaveBeenCalledWith({ nome: 'Ana Souza' });
    expect(
      await within(cabecalho()).findByRole('heading', { name: 'Ana Souza' }),
    ).toBeInTheDocument();
    expect(getSession().usuario?.nome).toBe('Ana Souza');
    expect(cabecalho().querySelector('[data-avatar]')).toHaveTextContent('AS');
    await waitFor(() => expect(editar()).toHaveFocus());
  });

  it('Esc cancela SEM request: o nome continua o mesmo e o foco volta ao Editar', async () => {
    const user = renderPerfil();

    await user.click(editar());
    await user.type(screen.getByLabelText('Nome'), ' mudado{Escape}');

    expect(perfil.atualizar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(within(cabecalho()).getByRole('heading', { name: 'Ana Teste' })).toBeInTheDocument();
    await waitFor(() => expect(editar()).toHaveFocus());
  });

  it('Cancelar também não faz request', async () => {
    const user = renderPerfil();

    await user.click(editar());
    await user.type(screen.getByLabelText('Nome'), 'x');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(perfil.atualizar).not.toHaveBeenCalled();
    expect(within(cabecalho()).getByRole('heading', { name: 'Ana Teste' })).toBeInTheDocument();
  });

  it('nome vazio ou com 61 caracteres: erro sob o campo e NENHUMA request', async () => {
    const user = renderPerfil();

    await user.click(editar());
    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), '   {Enter}');
    expect(screen.getByText('Informe seu nome')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nome'));
    await user.type(screen.getByLabelText('Nome'), `${'a'.repeat(61)}{Enter}`);
    expect(screen.getByText('O nome pode ter no máximo 60 caracteres')).toBeInTheDocument();

    expect(perfil.atualizar).not.toHaveBeenCalled();
  });

  it('400 da API com fields.nome: a mensagem aparece sob o campo e o campo continua aberto', async () => {
    perfil.atualizar.mockRejectedValue(
      httpError(400, {
        statusCode: 400,
        code: 'VALIDACAO',
        message: 'x',
        fields: { nome: 'Informe seu nome' },
      }),
    );
    const user = renderPerfil();

    await user.click(editar());
    await user.type(screen.getByLabelText('Nome'), '{Enter}');

    expect(await screen.findByText('Informe seu nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true');
    expect(getSession().usuario?.nome).toBe('Ana Teste');
  });

  it('sem conexão: mensagem de sem conexão, nada muda', async () => {
    perfil.atualizar.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderPerfil();

    await user.click(editar());
    await user.type(screen.getByLabelText('Nome'), ' B{Enter}');

    expect(
      await screen.findByText('Sem conexão. Tente de novo quando a conexão voltar.'),
    ).toBeInTheDocument();
    expect(getSession().usuario?.nome).toBe('Ana Teste');
  });

  it('o botão Editar mede 44 × 44 (size-11) e tem nome acessível', () => {
    renderPerfil();

    expect(editar()).toHaveClass('size-11');
  });
});

describe('estrutura da página (CA-31, CA-33)', () => {
  const conta = () => screen.getByRole('region', { name: 'Conta' });

  it('Conta em linhas: Trocar senha, Sessões ativas e Sair, nesta ordem, sem repetir o nome', () => {
    renderPerfil();

    const ordem = [
      within(conta()).getByRole('link', { name: 'Trocar senha' }),
      within(conta()).getByRole('button', { name: 'Sessões ativas' }),
      within(conta()).getByRole('button', { name: 'Sair' }),
    ];
    for (let i = 1; i < ordem.length; i++) {
      expect(
        (ordem[i - 1] as HTMLElement).compareDocumentPosition(ordem[i] as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(conta()).getByRole('link', { name: 'Trocar senha' })).toHaveAttribute(
      'href',
      '/perfil/senha',
    );
    expect(within(conta()).queryByText('Ana Teste')).not.toBeInTheDocument();
  });

  it('as seções vêm na ordem: cabeçalho, Conta, Preferências, Zona de perigo', () => {
    renderPerfil();

    const secoes = [
      cabecalho(),
      conta(),
      screen.getByRole('region', { name: 'Preferências' }),
      screen.getByRole('region', { name: 'Zona de perigo' }),
    ];
    for (let i = 1; i < secoes.length; i++) {
      expect(
        (secoes[i - 1] as HTMLElement).compareDocumentPosition(secoes[i] as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('as preferências saíram da página: só a linha que abre o modal (com o resumo)', () => {
    renderPerfil();

    const linha = screen.getByRole('button', { name: /Preferências do aparelho/ });
    expect(linha).toHaveTextContent('Magenta · Confortável');
    // Embaixo do rótulo, e não ao lado dele: em 375 px o rótulo quebrava em duas linhas.
    const detalhe = linha.querySelector('[data-detalhe]');
    expect(detalhe).toHaveTextContent('Magenta · Confortável');
    expect(detalhe?.parentElement).toHaveClass('flex-col');
    expect(detalhe?.parentElement).toHaveTextContent(/^Preferências do aparelho/);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('uma coluna só: sem o grid de duas colunas', () => {
    renderPerfil();

    expect(document.querySelector('[class*="grid-cols-2"]')).toBeNull();
  });

  it('Sessões ativas expande no lugar (aria-expanded) e mostra a lista (CA-12)', async () => {
    perfil.listarSessoes.mockResolvedValue([
      {
        id: 's-a',
        dispositivo: 'Chrome · Windows',
        criadoEm: '2026-09-24T12:00:00.000Z',
        ultimoUsoEm: '2026-09-24T12:00:00.000Z',
        atual: true,
      },
    ]);
    const user = renderPerfil();
    const linha = screen.getByRole('button', { name: 'Sessões ativas' });
    expect(linha).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Este aparelho')).not.toBeInTheDocument();

    await user.click(linha);

    expect(linha).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Este aparelho')).toBeInTheDocument();
    await user.click(linha);
    expect(screen.queryByText('Este aparelho')).not.toBeInTheDocument();
  });

  it('Sair chama o logout e a sessão local termina (CA-33)', async () => {
    auth.logout.mockResolvedValue(undefined);
    const user = renderPerfil();

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getSession().status).not.toBe('autenticado'));
  });

  it('Sair sem conexão avisa e NÃO sai (CA-33)', async () => {
    auth.logout.mockRejectedValue(new AxiosError('rede', 'ERR_NETWORK'));
    const user = renderPerfil();

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('Sem conexão. Para sair, conecte-se.')).toBeInTheDocument();
    expect(getSession().status).toBe('autenticado');
  });

  it('Excluir conta abre o diálogo da etapa 4, inalterado (CA-33)', async () => {
    const user = renderPerfil();

    await user.click(screen.getByRole('button', { name: 'Excluir conta' }));

    expect(await screen.findByRole('heading', { name: 'Excluir conta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});

describe('linha de Preferências abre o modal (CA-34)', () => {
  it('abre na aba Aparência com o foco dentro; Esc/Concluído fecham e o foco volta à linha', async () => {
    const user = renderPerfil();
    const linha = screen.getByRole('button', { name: /Preferências do aparelho/ });

    await user.click(linha);

    const modal = screen.getByRole('dialog', { name: 'Preferências' });
    expect(within(modal).getByRole('tab', { name: 'Aparência', selected: true })).toHaveFocus();

    await user.click(within(modal).getByRole('button', { name: 'Concluído' }));
    expect(screen.queryByRole('dialog', { name: 'Preferências' })).not.toBeInTheDocument();
    expect(linha).toHaveFocus();

    await user.click(linha);
    expect(screen.getByRole('dialog', { name: 'Preferências' })).toBeInTheDocument();
    // O Esc nativo do <dialog> não existe no jsdom: o navegador responde a ele com `close()`.
    act(() => (screen.getByRole('dialog', { name: 'Preferências' }) as HTMLDialogElement).close());
    expect(linha).toHaveFocus();
  });

  it('o resumo da linha acompanha a escolha feita no modal', async () => {
    const user = renderPerfil();

    await user.click(screen.getByRole('button', { name: /Preferências do aparelho/ }));
    await user.click(screen.getByRole('radio', { name: 'Violeta' }));
    await user.click(screen.getByRole('radio', { name: 'Compacta' }));
    await user.click(screen.getByRole('button', { name: 'Concluído' }));

    expect(screen.getByRole('button', { name: /Preferências do aparelho/ })).toHaveTextContent(
      'Violeta · Compacta',
    );
  });
});

describe('"Instalar app" só quando dá para instalar (CA-06)', () => {
  it('navegador sem convite e fora do iOS: sem o botão', () => {
    renderPerfil();

    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
  });

  it('Chrome/Edge com o convite nativo: o botão abre o prompt nativo', async () => {
    vi.mocked(podeInstalar).mockReturnValue(true);
    vi.mocked(pedirInstalacao).mockResolvedValue('aceito');
    const user = renderPerfil();

    await user.click(screen.getByRole('button', { name: 'Instalar app' }));

    expect(pedirInstalacao).toHaveBeenCalledTimes(1);
  });

  it('aberto pelo ícone instalado: sem o botão, mesmo com o convite guardado', () => {
    vi.mocked(podeInstalar).mockReturnValue(true);
    vi.mocked(estaInstalado).mockReturnValue(true);
    renderPerfil();

    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
  });

  it('Safari do iOS: o botão mostra o passo a passo, sem prompt nativo', async () => {
    vi.mocked(ehSafariIos).mockReturnValue(true);
    const user = renderPerfil();
    // A seção "Contas vinculadas" carrega de forma assíncrona e o esqueleto dela também é um `status`.
    await screen.findByRole('button', { name: 'Vincular conta' });

    await user.click(screen.getByRole('button', { name: 'Instalar app' }));

    expect(screen.getByRole('status')).toHaveTextContent('Adicionar à Tela de Início');
    expect(pedirInstalacao).not.toHaveBeenCalled();
  });
});

describe('aviso do retorno da Steam e seção "Contas vinculadas" (CA-15)', () => {
  it('sem vínculo, a seção "Contas vinculadas" fica entre Conta e Preferências, com "Vincular conta"', async () => {
    renderPerfil();

    const secoes = screen.getAllByRole('region').map((secao) => secao.getAttribute('aria-label'));
    expect(secoes.indexOf('Conta')).toBeLessThan(secoes.indexOf('Contas vinculadas'));
    expect(secoes.indexOf('Contas vinculadas')).toBeLessThan(secoes.indexOf('Preferências'));
    expect(await screen.findByRole('button', { name: 'Vincular conta' })).toBeInTheDocument();
  });

  it('?steam=vinculada mostra o aviso de sucesso e limpa a URL', async () => {
    renderPerfil('/perfil?steam=vinculada');

    expect(await screen.findByText('Conta Steam vinculada.')).toBeInTheDocument();
    expect(screen.getByText('Conta Steam vinculada.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(screen.getByTestId('url-atual')).toHaveTextContent(/^$/));
  });

  it.each([
    ['cancelado', 'Vínculo cancelado. Nada foi alterado.'],
    ['invalido', 'Não foi possível confirmar sua conta Steam. Tente de novo.'],
    ['expirado', 'O vínculo demorou demais e expirou. Tente de novo.'],
    ['indisponivel', 'A Steam não respondeu agora. Tente de novo em instantes.'],
    [
      'ja-vinculada',
      'Você já tem outra conta Steam vinculada. Desvincule-a antes de vincular esta.',
    ],
  ])('?steam=erro&motivo=%s mostra o texto próprio e limpa a URL', async (motivo, texto) => {
    renderPerfil(`/perfil?steam=erro&motivo=${motivo}`);

    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent(texto);
    await waitFor(() => expect(screen.getByTestId('url-atual')).toHaveTextContent(/^$/));
  });

  it.each([
    '/perfil?steam=qualquer',
    '/perfil?steam=erro&motivo=desconhecido',
    '/perfil?steam=erro',
  ])('%s é ignorado: nenhum aviso', async (entrada) => {
    renderPerfil(entrada);

    await screen.findByRole('button', { name: 'Vincular conta' });
    expect(screen.queryByText(/Steam vinculada|Vínculo|Não foi possível confirmar/)).toBeNull();
  });

  it('só os parâmetros do retorno saem da URL: outros parâmetros ficam', async () => {
    renderPerfil('/perfil?steam=vinculada&outro=1');

    await waitFor(() => expect(screen.getByTestId('url-atual')).toHaveTextContent('?outro=1'));
  });

  it('o aviso continua na tela depois de a URL ser limpa (é lido uma vez)', async () => {
    renderPerfil('/perfil?steam=vinculada');

    await waitFor(() => expect(screen.getByTestId('url-atual')).toHaveTextContent(/^$/));
    expect(screen.getByText('Conta Steam vinculada.')).toBeInTheDocument();
  });
});
