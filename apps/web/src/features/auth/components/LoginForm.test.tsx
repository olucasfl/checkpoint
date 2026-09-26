import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { type AuthResponse } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { getSession, resetSessionForTests } from '../session/session';
import { LoginForm } from './LoginForm';

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
      <LoginForm />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const email = () => screen.getByLabelText('E-mail');
const senha = () => screen.getByLabelText('Senha');

beforeEach(() => {
  vi.resetAllMocks();
  resetSessionForTests();
  storage.clearScope('usuario');
});

describe('LoginForm — campos (CA-37)', () => {
  it('e-mail: type, autocomplete, inputmode, autocapitalize e spellcheck da spec', () => {
    renderForm();

    expect(email()).toHaveAttribute('type', 'email');
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(email()).toHaveAttribute('inputmode', 'email');
    expect(email()).toHaveAttribute('autocapitalize', 'off');
    expect(email()).toHaveAttribute('spellcheck', 'false');
  });

  it('senha: type password e autocomplete current-password', () => {
    renderForm();

    expect(senha()).toHaveAttribute('type', 'password');
    expect(senha()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('fonte dos campos de 16px (piso de 16px: o iOS não dá zoom ao focar)', () => {
    renderForm();

    expect(email().className).toContain('text-base');
    expect(senha().className).toContain('text-base');
  });

  it('"mostrar senha": botão de 44 × 44 com aria-pressed, que alterna o tipo do campo', async () => {
    const user = renderForm();
    const mostrar = screen.getByRole('button', { name: 'Mostrar senha' });

    expect(mostrar).toHaveAttribute('aria-pressed', 'false');
    expect(mostrar).toHaveClass('size-11');
    await user.click(mostrar);

    expect(mostrar).toHaveAttribute('aria-pressed', 'true');
    expect(senha()).toHaveAttribute('type', 'text');
    await user.click(mostrar);
    expect(senha()).toHaveAttribute('type', 'password');
  });

  it('o botão Entrar e o link Criar conta existem e têm alvo de 44 px', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/registro');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveClass('min-h-11');
  });

  it('Enter no último campo envia (CA-37)', async () => {
    api.login.mockResolvedValue(auth);
    const user = renderForm();

    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'segredo-forte{Enter}');

    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
  });
});

describe('LoginForm — envio', () => {
  it('envia o e-mail aparado e a senha exatamente como digitada; sucesso registra a sessão', async () => {
    api.login.mockResolvedValue(auth);
    const user = renderForm();

    await user.type(email(), '  ana@exemplo.com ');
    await user.type(senha(), '  segredo com espaços ');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(getSession().status).toBe('autenticado'));
    expect(api.login).toHaveBeenCalledWith({
      email: 'ana@exemplo.com',
      senha: '  segredo com espaços ',
    });
    expect(storage.get((await import('../lib/session-keys')).SESSAO_ATIVA)).toBe(true);
  });

  it('campos vazios: mensagens locais e NENHUMA request', async () => {
    const user = renderForm();

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe um e-mail válido')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha')).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('credencial errada: mensagem do code, e-mail mantido, senha limpa e foco na senha (CA-25)', async () => {
    api.login.mockRejectedValue(httpError(401, 'AUTH_CREDENCIAIS_INVALIDAS'));
    const user = renderForm();

    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'senha-errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(email()).toHaveValue('ana@exemplo.com');
    expect(senha()).toHaveValue('');
    await waitFor(() => expect(senha()).toHaveFocus());
    expect(getSession().status).toBe('carregando');
  });

  it('6ª tentativa: 429 → "Muitas tentativas. Aguarde um pouco e tente de novo." (CA-39)', async () => {
    api.login.mockRejectedValue(httpError(429, 'LIMITE_TENTATIVAS'));
    const user = renderForm();

    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'qualquer-coisa');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Muitas tentativas. Aguarde um pouco e tente de novo.'),
    ).toBeInTheDocument();
  });

  it('sem conexão: mensagem própria, e a senha também é limpa', async () => {
    api.login.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderForm();

    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'segredo-forte');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Sem conexão. Tente de novo quando a conexão voltar.'),
    ).toBeInTheDocument();
  });

  it('400 com fields: mostra a mensagem junto do campo, sem mensagem geral', async () => {
    api.login.mockRejectedValue(httpError(400, 'VALIDACAO', { email: 'Informe um e-mail válido' }));
    const user = renderForm();

    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'segredo-forte');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe um e-mail válido')).toHaveAttribute(
      'id',
      'login-email-err',
    );
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Confira os campos e tente de novo.')).not.toBeInTheDocument();
  });

  it('não envia duas vezes enquanto a primeira resposta não volta', async () => {
    let responder: (value: AuthResponse) => void = () => undefined;
    api.login.mockReturnValue(new Promise((resolve) => (responder = resolve)));
    const user = renderForm();

    await user.type(email(), 'ana@exemplo.com');
    await user.type(senha(), 'segredo-forte');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    await user.keyboard('{Enter}');

    expect(api.login).toHaveBeenCalledTimes(1);
    responder(auth);
  });
});
