import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth-api';
import { ConfirmeSeuEmail } from './ConfirmeSeuEmail';
import { REENVIO_ESPERA_SEGUNDOS } from './ReenviarVerificacao';

vi.mock('../api/auth-api', () => ({ authApi: { reenviarVerificacao: vi.fn() } }));
const api = vi.mocked(authApi);

function httpError(status: number, code: string): AxiosError {
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, code, message: 'não usar' },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

function renderTela(entrada: string | { pathname: string; search: string; state: unknown }) {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <ConfirmeSeuEmail />
    </MemoryRouter>,
  );
  // Timers falsos e `userEvent` pedem o avanço ligado ao relógio do vitest.
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConfirmeSeuEmail (CA-24, CA-25)', () => {
  it('mostra o e-mail digitado e o texto "Enviamos um link de confirmação…"', () => {
    renderTela('/confirme-seu-email?email=ana%40exemplo.com');

    expect(screen.getByText(/Enviamos um link de confirmação para/)).toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText(/Clique nele para continuar/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Já confirmei, entrar' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('o envio do registro falhou: avisa que não saiu e oferece reenviar (CA-22a)', () => {
    renderTela({
      pathname: '/confirme-seu-email',
      search: '?email=ana%40exemplo.com',
      state: { emailEnviado: false },
    });

    expect(screen.getByText(/não conseguimos enviar o e-mail/)).toBeInTheDocument();
    expect(screen.queryByText(/Enviamos um link de confirmação/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeEnabled();
  });

  it('Reenviar chama a API com o e-mail, confirma e fica desabilitado por 30 s (CA-25)', async () => {
    api.reenviarVerificacao.mockResolvedValue({ estado: 'enviado' });
    const user = renderTela('/confirme-seu-email?email=ana%40exemplo.com');

    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(api.reenviarVerificacao).toHaveBeenCalledWith({ email: 'ana@exemplo.com' });
    expect(await screen.findByText(/Enviamos um novo link/)).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: `Reenviar em ${REENVIO_ESPERA_SEGUNDOS} s` });
    expect(botao).toBeDisabled();

    // Clicar de novo não dispara outra request.
    await user.click(botao);
    expect(api.reenviarVerificacao).toHaveBeenCalledTimes(1);

    // Um segundo por vez: cada tick re-renderiza e agenda o seguinte, como no relógio real.
    for (let i = 0; i < REENVIO_ESPERA_SEGUNDOS; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeEnabled();
  });

  it('conta que já estava verificada: diz isso e não entra em espera', async () => {
    api.reenviarVerificacao.mockResolvedValue({ estado: 'ja-verificado' });
    const user = renderTela('/confirme-seu-email?email=ana%40exemplo.com');

    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(await screen.findByText(/já está confirmado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeEnabled();
  });

  it('502 MAIL_INDISPONIVEL: mostra o texto do código e não entra em espera', async () => {
    api.reenviarVerificacao.mockRejectedValue(httpError(502, 'MAIL_INDISPONIVEL'));
    const user = renderTela('/confirme-seu-email?email=ana%40exemplo.com');

    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(
      await screen.findByText('Não conseguimos enviar o e-mail agora. Tente de novo em instantes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeEnabled();
  });

  it('429: mostra a mensagem de limite', async () => {
    api.reenviarVerificacao.mockRejectedValue(httpError(429, 'LIMITE_TENTATIVAS'));
    const user = renderTela('/confirme-seu-email?email=ana%40exemplo.com');

    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(
      await screen.findByText('Muitas tentativas. Aguarde um pouco e tente de novo.'),
    ).toBeInTheDocument();
  });

  it('sem ?email=, pede o e-mail antes de reenviar (e valida sem request)', async () => {
    api.reenviarVerificacao.mockResolvedValue({ estado: 'enviado' });
    const user = renderTela('/confirme-seu-email');

    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));
    expect(await screen.findByText('Informe um e-mail válido')).toBeInTheDocument();
    expect(api.reenviarVerificacao).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('E-mail'), ' ana@exemplo.com ');
    await user.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(api.reenviarVerificacao).toHaveBeenCalledWith({ email: 'ana@exemplo.com' });
  });
});
