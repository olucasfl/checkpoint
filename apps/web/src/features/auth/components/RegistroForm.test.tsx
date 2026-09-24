import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { type AuthResponse } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { getSession, resetSessionForTests } from '../session/session';
import { RegistroForm } from './RegistroForm';

vi.mock('../api/auth-api', () => ({
  authApi: { refresh: vi.fn(), logout: vi.fn(), login: vi.fn(), registro: vi.fn(), me: vi.fn() },
}));
const api = vi.mocked(authApi);

const usuario = {
  id: 'u1',
  nome: 'Ana Teste',
  email: 'ana@exemplo.com',
  criadoEm: '2026-09-24T12:00:00.000Z',
};
const auth: AuthResponse = { accessToken: 'token', usuario };

function httpError(status: number, code: string, fields?: Record<string, string>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar', ...(fields ? { fields } : {}) },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function renderForm() {
  render(
    <MemoryRouter>
      <RegistroForm />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const nome = () => screen.getByLabelText('Nome');
const email = () => screen.getByLabelText('E-mail');
const senha = () => screen.getByLabelText('Senha');
const confirmacao = () => screen.getByLabelText('Confirmar senha');

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  valores: { nome?: string; email?: string; senha?: string; confirmacao?: string } = {},
) {
  await user.type(nome(), valores.nome ?? 'Ana Teste');
  await user.type(email(), valores.email ?? 'ana@exemplo.com');
  await user.type(senha(), valores.senha ?? 'segredo-forte');
  await user.type(confirmacao(), valores.confirmacao ?? valores.senha ?? 'segredo-forte');
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  storage.clearScope('usuario');
});

describe('RegistroForm — tela (CA-24, CA-37)', () => {
  it('Nome, E-mail, Senha, Confirmar senha, o texto fixo e o link "Já tenho conta"', () => {
    renderForm();

    expect(nome()).toBeInTheDocument();
    expect(email()).toBeInTheDocument();
    expect(senha()).toBeInTheDocument();
    expect(confirmacao()).toBeInTheDocument();
    expect(
      screen.getByText(
        'Seu e-mail serve só para entrar: ele não é verificado e nenhum e-mail é enviado. Ainda não existe recuperação de senha — guarde a sua.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('type e autocomplete da spec em cada campo', () => {
    renderForm();

    expect(nome()).toHaveAttribute('autocomplete', 'name');
    expect(email()).toHaveAttribute('type', 'email');
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(email()).toHaveAttribute('inputmode', 'email');
    expect(senha()).toHaveAttribute('type', 'password');
    expect(senha()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmacao()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('a senha tem a dica "Mínimo de 8 caracteres"; os dois campos de senha têm "mostrar senha" de 44 × 44', () => {
    renderForm();

    expect(screen.getByText('Mínimo de 8 caracteres')).toBeInTheDocument();
    const botoes = screen.getAllByRole('button', { name: 'Mostrar senha' });
    expect(botoes).toHaveLength(2);
    for (const botao of botoes) {
      expect(botao).toHaveClass('size-11');
      expect(botao).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('Enter no último campo envia', async () => {
    api.registro.mockResolvedValue(auth);
    const user = renderForm();

    await user.type(nome(), 'Ana Teste');
    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'segredo-forte');
    await user.type(confirmacao(), 'segredo-forte{Enter}');

    await waitFor(() => expect(api.registro).toHaveBeenCalledTimes(1));
  });
});

describe('RegistroForm — validação local', () => {
  it('senhas diferentes: "As senhas não coincidem" e NENHUMA request (CA-24)', async () => {
    const user = renderForm();

    await preencher(user, { senha: 'segredo-forte', confirmacao: 'segredo-fortx' });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('As senhas não coincidem')).toBeInTheDocument();
    expect(api.registro).not.toHaveBeenCalled();
  });

  it('senha curta: o erro da senha vem primeiro (a confirmação só é cobrada com a senha ok)', async () => {
    const user = renderForm();

    await preencher(user, { senha: '1234567', confirmacao: 'outra-coisa' });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();
    expect(screen.queryByText('As senhas não coincidem')).not.toBeInTheDocument();
    expect(api.registro).not.toHaveBeenCalled();
  });

  it('campos vazios: todos os avisos locais, sem request', async () => {
    const user = renderForm();

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Informe seu nome')).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido')).toBeInTheDocument();
    expect(screen.getByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();
    expect(api.registro).not.toHaveBeenCalled();
  });

  it('a mensagem de "não coincidem" some quando a pessoa corrige e reenvia', async () => {
    api.registro.mockResolvedValue(auth);
    const user = renderForm();
    await preencher(user, { confirmacao: 'diferente-mesmo' });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    await screen.findByText('As senhas não coincidem');

    await user.clear(confirmacao());
    await user.type(confirmacao(), 'segredo-forte');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(api.registro).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('As senhas não coincidem')).not.toBeInTheDocument();
  });
});

describe('RegistroForm — envio', () => {
  it('sucesso: envia nome e e-mail aparados e entra direto (sessão autenticada) (CA-24)', async () => {
    api.registro.mockResolvedValue(auth);
    const user = renderForm();

    await preencher(user, { nome: '  Ana Teste ', email: ' ana@exemplo.com ' });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(getSession().status).toBe('autenticado'));
    expect(api.registro).toHaveBeenCalledWith({
      nome: 'Ana Teste',
      email: 'ana@exemplo.com',
      senha: 'segredo-forte',
    });
  });

  it('409: a mensagem aparece junto do campo E-mail (pelo fields)', async () => {
    api.registro.mockRejectedValue(
      httpError(409, 'AUTH_EMAIL_EM_USO', { email: 'Este e-mail já tem uma conta' }),
    );
    const user = renderForm();

    await preencher(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Este e-mail já tem uma conta')).toHaveAttribute(
      'id',
      'registro-email-err',
    );
    expect(email()).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['AUTH_REGISTRO_FECHADO', 403, 'O cadastro de novas contas está fechado.'],
    ['LIMITE_TENTATIVAS', 429, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  ])('%s vira mensagem geral, pelo code', async (code, status, texto) => {
    api.registro.mockRejectedValue(httpError(status, code));
    const user = renderForm();

    await preencher(user);
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(getSession().status).toBe('carregando');
  });
});
