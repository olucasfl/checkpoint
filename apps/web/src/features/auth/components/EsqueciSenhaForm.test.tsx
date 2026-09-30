import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../api/auth-api';
import { ESQUECI_SENHA_SUCESSO, EsqueciSenhaForm } from './EsqueciSenhaForm';

vi.mock('../api/auth-api', () => ({ authApi: { esqueciSenha: vi.fn() } }));
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

function renderForm() {
  render(
    <MemoryRouter>
      <EsqueciSenhaForm />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('EsqueciSenhaForm (CA-29)', () => {
  it('tem o campo E-mail e o botão "Enviar link"', () => {
    renderForm();

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para entrar' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('e-mail inválido: aviso local e NENHUMA request', async () => {
    const user = renderForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText('Informe um e-mail válido')).toBeInTheDocument();
    expect(api.esqueciSenha).not.toHaveBeenCalled();
  });

  it('envia o e-mail aparado e mostra a mensagem de sucesso fixa', async () => {
    api.esqueciSenha.mockResolvedValue(undefined);
    const user = renderForm();

    await user.type(screen.getByLabelText('E-mail'), '  ana@exemplo.com ');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText(ESQUECI_SENHA_SUCESSO)).toBeInTheDocument();
    expect(api.esqueciSenha).toHaveBeenCalledWith({ email: 'ana@exemplo.com' });
  });

  it('e-mail que existe e e-mail que não existe mostram EXATAMENTE a mesma mensagem (CA-29)', async () => {
    api.esqueciSenha.mockResolvedValue(undefined);

    const primeiro = renderForm();
    await primeiro.type(screen.getByLabelText('E-mail'), 'existe@exemplo.com');
    await primeiro.click(screen.getByRole('button', { name: 'Enviar link' }));
    const textoA = (await screen.findByRole('status')).textContent;

    document.body.innerHTML = '';
    const segundo = renderForm();
    await segundo.type(screen.getByLabelText('E-mail'), 'naoexiste@exemplo.com');
    await segundo.click(screen.getByRole('button', { name: 'Enviar link' }));
    const textoB = (await screen.findByRole('status')).textContent;

    expect(textoA).toBe(textoB);
    expect(textoA).not.toMatch(/não encontrad|não existe/i);
  });

  it('429: mostra o limite e mantém o formulário', async () => {
    api.esqueciSenha.mockRejectedValue(httpError(429, 'LIMITE_TENTATIVAS'));
    const user = renderForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(
      await screen.findByText('Muitas tentativas. Aguarde um pouco e tente de novo.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.com');
  });

  it('não envia duas vezes com o botão ocupado', async () => {
    let liberar: () => void = () => undefined;
    api.esqueciSenha.mockReturnValue(new Promise<void>((resolve) => (liberar = resolve)));
    const user = renderForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com{Enter}');
    await user.keyboard('{Enter}');
    liberar();

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(api.esqueciSenha).toHaveBeenCalledTimes(1);
  });
});
