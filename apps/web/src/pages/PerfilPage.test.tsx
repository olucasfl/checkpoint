import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { type Game, type Usuario } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entrar, getSession, resetSessionForTests } from '@/features/auth/session/session';
import { gamesApi } from '@/features/games/api/games-api';
import { perfilApi } from '@/features/perfil/api/perfil-api';
import { coverBackground } from '@/shared/lib/game-cover';
import { PREFS } from '@/shared/lib/prefs/prefs';
import { definirUsuario, resetPrefsForTests } from '@/shared/lib/prefs/prefs-store';
import { storage } from '@/shared/lib/storage/storage';
import { ehSafariIos, estaInstalado } from '@/shared/lib/pwa/display';
import { pedirInstalacao, podeInstalar } from '@/shared/lib/pwa/install-prompt';
import { PerfilPage } from './PerfilPage';

vi.mock('@/features/games/api/games-api', () => ({ gamesApi: { list: vi.fn() } }));
vi.mock('@/features/perfil/api/perfil-api', () => ({
  perfilApi: {
    atualizar: vi.fn(),
    listarSessoes: vi.fn(),
    encerrarSessao: vi.fn(),
    encerrarOutrasSessoes: vi.fn(),
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
  nota: null,
  capaUrl: null,
  criadoEm: '2026-09-24T12:00:00.000Z',
  atualizadoEm: '2026-09-24T12:00:00.000Z',
});

function renderPerfil() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/perfil']}>
        <PerfilPage />
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

describe('conta (CA-05)', () => {
  it('"Trocar senha" leva a /perfil/senha e Sair continua', () => {
    renderPerfil();

    expect(screen.getByRole('link', { name: 'Trocar senha' })).toHaveAttribute(
      'href',
      '/perfil/senha',
    );
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('a seção Conta tem Trocar senha, Sessões ativas e Sair, nesta ordem, sem repetir o nome (etapa 2)', async () => {
    perfil.listarSessoes.mockResolvedValue([
      {
        id: 's-a',
        dispositivo: 'Chrome · Windows',
        criadoEm: '2026-09-24T12:00:00.000Z',
        ultimoUsoEm: '2026-09-24T12:00:00.000Z',
        atual: true,
      },
    ]);
    renderPerfil();

    const conta = screen.getByRole('region', { name: 'Conta' });
    await within(conta).findByText('Este aparelho');
    const ordem = [
      within(conta).getByRole('link', { name: 'Trocar senha' }),
      within(conta).getByRole('heading', { name: 'Sessões ativas' }),
      within(conta).getByRole('button', { name: 'Sair' }),
    ];
    for (let i = 1; i < ordem.length; i++) {
      expect(
        (ordem[i - 1] as HTMLElement).compareDocumentPosition(ordem[i] as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(conta).queryByText('Ana Teste')).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Instalar app' }));

    expect(screen.getByRole('status')).toHaveTextContent('Adicionar à Tela de Início');
    expect(pedirInstalacao).not.toHaveBeenCalled();
  });
});

describe('preferências deste aparelho (perfil, etapa 3)', () => {
  const secao = () => screen.getByRole('region', { name: 'Preferências deste aparelho' });
  const grupo = (nome: string) => within(secao()).getByRole('radiogroup', { name: nome });

  it('a seção com a legenda e as quatro escolhas nos padrões da spec', () => {
    renderPerfil();

    expect(within(secao()).getByText('Salvas só neste aparelho')).toBeInTheDocument();
    const marcada = (nome: string) =>
      within(grupo(nome)).getByRole('radio', { checked: true }).textContent;
    expect(marcada('Cor de destaque')).toBe('Magenta');
    expect(marcada('Filtro inicial do catálogo')).toBe('Todos');
    expect(marcada('Densidade da lista')).toBe('Confortável');
    expect(marcada('Efeitos visuais')).toBe('Completos');
    expect(
      within(grupo('Cor de destaque'))
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Magenta', 'Violeta', 'Azul', 'Laranja']);
  });

  it('escolher Violeta muda na hora (aria-checked e <html>) e NÃO faz nenhuma request (CA-14)', async () => {
    const user = renderPerfil();
    await within(cabecalho()).findByText(/3 jogos/);
    const contagem = () =>
      [perfil.atualizar, perfil.listarSessoes, games.list].map((fn) => fn.mock.calls.length);
    const antes = contagem();

    await user.click(within(grupo('Cor de destaque')).getByRole('radio', { name: 'Violeta' }));

    expect(
      within(grupo('Cor de destaque')).getByRole('radio', { name: 'Violeta' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.destaque).toBe('violeta');
    expect(contagem()).toEqual(antes);
    expect(within(secao()).queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
  });

  it('fica gravada neste navegador, na entrada DESTE usuário', async () => {
    const user = renderPerfil();

    await user.click(within(grupo('Efeitos visuais')).getByRole('radio', { name: 'Reduzidos' }));
    await user.click(within(grupo('Densidade da lista')).getByRole('radio', { name: 'Compacta' }));

    const guardadas = storage.get(PREFS);
    expect(guardadas.ultimoUsuario).toBe(ANA.id);
    expect(guardadas.porUsuario[ANA.id]).toMatchObject({
      efeitos: 'reduzidos',
      densidade: 'compacta',
    });
    expect(document.documentElement.dataset.efeitos).toBe('reduzidos');
  });

  it('as setas trocam a opção marcada, como num grupo de rádios', async () => {
    const user = renderPerfil();
    const filtro = () => grupo('Filtro inicial do catálogo');

    within(filtro()).getByRole('radio', { name: 'Todos' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(within(filtro()).getByRole('radio', { name: 'Jogando' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(filtro()).getByRole('radio', { name: 'Jogando' })).toHaveFocus();
  });

  it('plataformas favoritas: até 8; a 9ª mostra "Até 8 favoritas" e não é marcada (CA-19)', async () => {
    const user = renderPerfil();
    const caixa = (nome: string) => within(secao()).getByRole('checkbox', { name: nome });
    const oito = ['PC', 'PS5', 'PS4', 'Xbox One', 'Nintendo Switch', 'Wii', 'Android', 'iOS'];

    for (const p of oito) {
      await user.click(caixa(p));
    }
    await user.click(caixa('Mega Drive'));

    expect(within(secao()).getByText('Até 8 favoritas')).toBeInTheDocument();
    expect(caixa('Mega Drive')).not.toBeChecked();
    expect(caixa('PS5')).toBeChecked();
    expect(storage.get(PREFS).porUsuario[ANA.id]).toMatchObject({ plataformasFavoritas: oito });

    await user.click(caixa('PC'));
    expect(within(secao()).queryByText('Até 8 favoritas')).not.toBeInTheDocument();
    expect(caixa('PC')).not.toBeChecked();
  });
});
