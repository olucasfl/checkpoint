import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth-api';
import { entrar, resetSessionForTests } from '../session/session';
import { gamesApi } from '@/features/games/api/games-api';
import { integracoesApi } from '@/features/integracoes/api/integracoes-api';
import { perfilApi } from '@/features/perfil/api/perfil-api';
import { PerfilPage } from '@/pages/PerfilPage';
import { TrocarSenhaForm } from './TrocarSenhaForm';

vi.mock('../api/auth-api', () => ({
  authApi: {
    refresh: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    registro: vi.fn(),
    me: vi.fn(),
    trocarSenha: vi.fn(),
  },
}));
// O `/perfil` mostra o resumo do catálogo (query ['games']); aqui a lista vem vazia.
vi.mock('@/features/games/api/games-api', () => ({ gamesApi: { list: vi.fn() } }));
// E a lista de sessões da seção Conta (vazia aqui).
vi.mock('@/features/perfil/api/perfil-api', () => ({
  perfilApi: { atualizar: vi.fn(), listarSessoes: vi.fn() },
}));
// E a seção "Contas vinculadas" (nenhuma conta vinculada aqui).
vi.mock('@/features/integracoes/api/integracoes-api', () => ({
  integracoesApi: { listarContas: vi.fn() },
}));
const api = vi.mocked(authApi);

/** O `/perfil` usa a query de jogos: toda renderização dele precisa de um QueryClient. */
function comQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function httpError(status: number, code: string, fields?: Record<string, string>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar', ...(fields ? { fields } : {}) },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

/** O formulário em `/perfil/senha`, com o `/perfil` de verdade ao lado para o sucesso voltar a ele. */
function renderForm() {
  render(
    comQuery(
      <MemoryRouter initialEntries={['/perfil/senha']}>
        <Routes>
          <Route path="/perfil/senha" element={<TrocarSenhaForm />} />
          <Route path="/perfil" element={<PerfilPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return userEvent.setup();
}

const atual = () => screen.getByLabelText('Senha atual');
const nova = () => screen.getByLabelText('Nova senha');
const confirmacao = () => screen.getByLabelText('Confirmar nova senha');
const enviar = () => screen.getByRole('button', { name: 'Trocar senha' });

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  valores: { atual?: string; nova?: string; confirmacao?: string } = {},
) {
  await user.type(atual(), valores.atual ?? 'segredo-forte');
  await user.type(nova(), valores.nova ?? 'outra-senha-boa');
  await user.type(confirmacao(), valores.confirmacao ?? valores.nova ?? 'outra-senha-boa');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gamesApi.list).mockResolvedValue([]);
  vi.mocked(perfilApi.listarSessoes).mockResolvedValue([]);
  vi.mocked(integracoesApi.listarContas).mockResolvedValue([]);
  resetSessionForTests();
  entrar({
    accessToken: 'token',
    usuario: {
      id: 'u1',
      nome: 'Ana Teste',
      email: 'ana@exemplo.com',
      criadoEm: '2026-09-24T12:00:00.000Z',
    },
  });
});

describe('TrocarSenhaForm (CA-56)', () => {
  it('campos com autocomplete certo: atual = current-password, nova e confirmação = new-password', () => {
    renderForm();

    expect(atual()).toHaveAttribute('autocomplete', 'current-password');
    expect(nova()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmacao()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('confirmação diferente → "As senhas não coincidem" e NENHUMA request', async () => {
    const user = renderForm();
    await preencher(user, { confirmacao: 'outra-senha-ruim' });

    await user.click(enviar());

    expect(await screen.findByText('As senhas não coincidem')).toBeInTheDocument();
    expect(api.trocarSenha).not.toHaveBeenCalled();
  });

  it('nova senha curta e senha atual vazia são avisadas antes de enviar', async () => {
    const user = renderForm();
    await user.type(nova(), '1234567');
    await user.type(confirmacao(), '1234567');

    await user.click(enviar());

    expect(await screen.findByText('Informe a senha atual')).toBeInTheDocument();
    expect(screen.getByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();
    expect(api.trocarSenha).not.toHaveBeenCalled();
  });

  it('sucesso: envia { senhaAtual, novaSenha } e volta para /perfil com o aviso', async () => {
    api.trocarSenha.mockResolvedValue(undefined);
    const user = renderForm();
    await preencher(user);

    await user.click(enviar());

    expect(api.trocarSenha).toHaveBeenCalledWith({
      senhaAtual: 'segredo-forte',
      novaSenha: 'outra-senha-boa',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha alterada. As outras sessões foram encerradas.',
    );
    expect(screen.getByRole('heading', { name: 'PERFIL' })).toBeInTheDocument();
  });

  it('AUTH_SENHA_ATUAL_INCORRETA → mensagem sob o campo Senha atual (pelo fields)', async () => {
    api.trocarSenha.mockRejectedValue(
      httpError(400, 'AUTH_SENHA_ATUAL_INCORRETA', { senhaAtual: 'Senha atual incorreta.' }),
    );
    const user = renderForm();
    await preencher(user, { atual: 'nao-e-esta' });

    await user.click(enviar());

    await waitFor(() => expect(atual()).toHaveAccessibleDescription(/Senha atual incorreta\./));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('AUTH_SENHA_IGUAL_ATUAL → mensagem sob o campo Nova senha', async () => {
    api.trocarSenha.mockRejectedValue(
      httpError(400, 'AUTH_SENHA_IGUAL_ATUAL', {
        novaSenha: 'A nova senha precisa ser diferente da atual.',
      }),
    );
    const user = renderForm();
    await preencher(user, { nova: 'segredo-forte' });

    await user.click(enviar());

    await waitFor(() =>
      expect(nova()).toHaveAccessibleDescription(/A nova senha precisa ser diferente da atual\./),
    );
  });

  it('LIMITE_TENTATIVAS (sem fields) → mensagem geral pelo code, não pela message da API', async () => {
    api.trocarSenha.mockRejectedValue(httpError(429, 'LIMITE_TENTATIVAS'));
    const user = renderForm();
    await preencher(user);

    await user.click(enviar());

    expect(
      await screen.findByText('Muitas tentativas. Aguarde um pouco e tente de novo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('não usar')).not.toBeInTheDocument();
  });

  it('"Mostrar senha": 1 botão por campo, com aria-pressed, que alterna o tipo do campo', async () => {
    const user = renderForm();
    const botoes = screen.getAllByRole('button', { name: 'Mostrar senha' });
    expect(botoes).toHaveLength(3);
    const [primeiro] = botoes;

    expect(primeiro).toHaveAttribute('aria-pressed', 'false');
    expect(atual()).toHaveAttribute('type', 'password');
    await user.click(primeiro as HTMLElement);

    expect(primeiro).toHaveAttribute('aria-pressed', 'true');
    expect(atual()).toHaveAttribute('type', 'text');
    expect(nova()).toHaveAttribute('type', 'password');
  });
});

describe('/perfil e a troca de senha', () => {
  it('o link "Trocar senha" leva a /perfil/senha', () => {
    render(
      comQuery(
        <MemoryRouter initialEntries={['/perfil']}>
          <PerfilPage />
        </MemoryRouter>,
      ),
    );

    expect(screen.getByRole('link', { name: 'Trocar senha' })).toHaveAttribute(
      'href',
      '/perfil/senha',
    );
  });

  it('sem o aviso no state da navegação, nenhuma mensagem de sucesso aparece', async () => {
    render(
      comQuery(
        <MemoryRouter
          initialEntries={[{ pathname: '/perfil', state: { aviso: 'qualquer texto' } }]}
        >
          <PerfilPage />
        </MemoryRouter>,
      ),
    );
    // A seção "Contas vinculadas" carrega de forma assíncrona e o esqueleto dela também é um `status`:
    // espera terminar para afirmar que nenhum `status` (mensagem de sucesso) sobrou.
    await screen.findByRole('button', { name: 'Vincular conta' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(within(document.body).queryByText('qualquer texto')).not.toBeInTheDocument();
  });
});
