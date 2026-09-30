import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth-api';
import { VerificarEmail } from './VerificarEmail';

vi.mock('../api/auth-api', () => ({
  authApi: { verificarEmail: vi.fn(), reenviarVerificacao: vi.fn() },
}));
const api = vi.mocked(authApi);

const TOKEN = 'ab'.repeat(32);

function httpError(status: number, code: string): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function renderTela(search = `?token=${TOKEN}`) {
  render(
    <MemoryRouter initialEntries={[`/verificar-email${search}`]}>
      <VerificarEmail />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('VerificarEmail (CA-26)', () => {
  it('chama a API ao montar, com o token da URL, e mostra "E-mail confirmado!" e Entrar', async () => {
    api.verificarEmail.mockResolvedValue({ jaEstavaVerificado: false });

    renderTela();

    expect(screen.getByText('Confirmando seu e-mail…')).toBeInTheDocument();
    expect(await screen.findByText('E-mail confirmado!')).toBeInTheDocument();
    expect(api.verificarEmail).toHaveBeenCalledWith({ token: TOKEN });
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  });

  it('o mesmo link de novo (jaEstavaVerificado true) mostra a MESMA tela', async () => {
    api.verificarEmail.mockResolvedValue({ jaEstavaVerificado: true });

    renderTela();

    expect(await screen.findByText('E-mail confirmado!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('token inválido: a mensagem, o campo de e-mail e o botão Reenviar', async () => {
    api.verificarEmail.mockRejectedValue(httpError(401, 'AUTH_TOKEN_INVALIDO'));

    renderTela();

    expect(await screen.findByText('Esse link não é mais válido.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeInTheDocument();
    expect(screen.queryByText('E-mail confirmado!')).not.toBeInTheDocument();
  });

  it('token de formato errado (400 VALIDACAO) também cai em "link inválido"', async () => {
    api.verificarEmail.mockRejectedValue(httpError(400, 'VALIDACAO'));

    renderTela('?token=cortado');

    expect(await screen.findByText('Esse link não é mais válido.')).toBeInTheDocument();
  });

  it('o Reenviar do link inválido usa o e-mail digitado (o token não revela o e-mail)', async () => {
    api.verificarEmail.mockRejectedValue(httpError(401, 'AUTH_TOKEN_INVALIDO'));
    api.reenviarVerificacao.mockResolvedValue({ estado: 'enviado' });
    const user = renderTela();
    await screen.findByText('Esse link não é mais válido.');

    await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    await waitFor(() =>
      expect(api.reenviarVerificacao).toHaveBeenCalledWith({ email: 'ana@exemplo.com' }),
    );
    expect(await screen.findByText(/Enviamos um novo link/)).toBeInTheDocument();
  });

  it('falha passageira (sem conexão): mostra o erro e deixa tentar de novo, sem tratar como link inválido', async () => {
    api.verificarEmail.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    api.verificarEmail.mockResolvedValueOnce({ jaEstavaVerificado: false });
    const user = renderTela();

    expect(
      await screen.findByText('Sem conexão. Tente de novo quando a conexão voltar.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Esse link não é mais válido.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('E-mail confirmado!')).toBeInTheDocument();
  });

  it('sem ?token= na URL: a API recebe token vazio e cai em "link inválido"', async () => {
    api.verificarEmail.mockRejectedValue(httpError(400, 'VALIDACAO'));

    renderTela('');

    expect(await screen.findByText('Esse link não é mais válido.')).toBeInTheDocument();
    expect(api.verificarEmail).toHaveBeenCalledWith({ token: '' });
  });
});
