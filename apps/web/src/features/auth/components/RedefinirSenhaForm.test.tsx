import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth-api';
import { RedefinirSenhaForm } from './RedefinirSenhaForm';

vi.mock('../api/auth-api', () => ({ authApi: { redefinirSenha: vi.fn() } }));
const api = vi.mocked(authApi);

const TOKEN = 'cd'.repeat(32);

function httpError(status: number, code: string, fields?: Record<string, string>): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar', ...(fields ? { fields } : {}) },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function Destino() {
  const { pathname, search } = useLocation();
  return <output data-testid="destino">{`${pathname}${search}`}</output>;
}

function renderForm(search = `?token=${TOKEN}`) {
  render(
    <MemoryRouter initialEntries={[`/redefinir-senha${search}`]}>
      <Routes>
        <Route path="/redefinir-senha" element={<RedefinirSenhaForm />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const nova = () => screen.getByLabelText('Nova senha');
const confirmacao = () => screen.getByLabelText('Confirmar nova senha');
const enviar = () => screen.getByRole('button', { name: 'Redefinir senha' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('RedefinirSenhaForm (CA-30, CA-31)', () => {
  it('senhas diferentes: "As senhas não coincidem" e NENHUMA request (CA-30)', async () => {
    const user = renderForm();

    await user.type(nova(), 'outra-senha-boa');
    await user.type(confirmacao(), 'outra-senha-boz');
    await user.click(enviar());

    expect(await screen.findByText('As senhas não coincidem')).toBeInTheDocument();
    expect(api.redefinirSenha).not.toHaveBeenCalled();
  });

  it('senha curta: o erro da senha vem primeiro e nenhuma request sai', async () => {
    const user = renderForm();

    await user.type(nova(), '1234567');
    await user.type(confirmacao(), 'outra-coisa');
    await user.click(enviar());

    expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();
    expect(screen.queryByText('As senhas não coincidem')).not.toBeInTheDocument();
    expect(api.redefinirSenha).not.toHaveBeenCalled();
  });

  it('sucesso: manda token e senha (sem aparar) e vai para /login com o aviso (CA-30)', async () => {
    api.redefinirSenha.mockResolvedValue(undefined);
    const user = renderForm();

    await user.type(nova(), ' outra senha boa ');
    await user.type(confirmacao(), ' outra senha boa ');
    await user.click(enviar());

    await waitFor(() =>
      expect(screen.getByTestId('destino')).toHaveTextContent('/login?motivo=senha-redefinida'),
    );
    expect(api.redefinirSenha).toHaveBeenCalledWith({
      token: TOKEN,
      novaSenha: ' outra senha boa ',
    });
  });

  it('AUTH_TOKEN_INVALIDO: "Esse link não é mais válido." e "Pedir um link novo" → /esqueci-senha (CA-31)', async () => {
    api.redefinirSenha.mockRejectedValue(httpError(401, 'AUTH_TOKEN_INVALIDO'));
    const user = renderForm();

    await user.type(nova(), 'outra-senha-boa');
    await user.type(confirmacao(), 'outra-senha-boa');
    await user.click(enviar());

    expect(await screen.findByText('Esse link não é mais válido.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir um link novo' })).toHaveAttribute(
      'href',
      '/esqueci-senha',
    );
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  });

  it('sem ?token= na URL: já mostra o link inválido, sem formulário (CA-31)', () => {
    renderForm('');

    expect(screen.getByText('Esse link não é mais válido.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir um link novo' })).toBeInTheDocument();
    expect(api.redefinirSenha).not.toHaveBeenCalled();
  });

  it('fields.token (link cortado) também leva a "link inválido"', async () => {
    api.redefinirSenha.mockRejectedValue(
      httpError(400, 'VALIDACAO', { token: 'O link está incompleto ou inválido' }),
    );
    const user = renderForm();

    await user.type(nova(), 'outra-senha-boa');
    await user.type(confirmacao(), 'outra-senha-boa');
    await user.click(enviar());

    expect(await screen.findByText('Esse link não é mais válido.')).toBeInTheDocument();
  });

  it('fields.novaSenha da API aparece junto do campo, e o formulário continua (o link segue válido)', async () => {
    api.redefinirSenha.mockRejectedValue(
      httpError(400, 'VALIDACAO', { novaSenha: 'A senha não pode ser só espaços' }),
    );
    const user = renderForm();

    await user.type(nova(), 'outra-senha-boa');
    await user.type(confirmacao(), 'outra-senha-boa');
    await user.click(enviar());

    expect(await screen.findByText('A senha não pode ser só espaços')).toBeInTheDocument();
    expect(nova()).toHaveAttribute('aria-invalid', 'true');
  });

  it('sem conexão: mensagem própria e o formulário continua', async () => {
    api.redefinirSenha.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const user = renderForm();

    await user.type(nova(), 'outra-senha-boa');
    await user.type(confirmacao(), 'outra-senha-boa');
    await user.click(enviar());

    expect(
      await screen.findByText('Sem conexão. Tente de novo quando a conexão voltar.'),
    ).toBeInTheDocument();
    expect(nova()).toBeInTheDocument();
  });

  it('tem "mostrar senha" nos dois campos e autocomplete new-password', () => {
    renderForm();

    expect(screen.getAllByRole('button', { name: 'Mostrar senha' })).toHaveLength(2);
    expect(nova()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmacao()).toHaveAttribute('autocomplete', 'new-password');
  });
});
