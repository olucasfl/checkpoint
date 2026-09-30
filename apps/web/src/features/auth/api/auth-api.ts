import {
  CSRF_HEADER,
  type AuthResponse,
  type EsqueciSenhaRequest,
  type LoginRequest,
  type RedefinirSenhaRequest,
  type ReenviarVerificacaoRequest,
  type ReenviarVerificacaoResponse,
  type RegistroRequest,
  type RegistroResponse,
  type TrocarSenhaRequest,
  type Usuario,
  type VerificarEmailRequest,
  type VerificarEmailResponse,
} from '@checkpoint/shared';
import { apiClient, type ApiRequestConfig } from '@/shared/lib/api-client';

/**
 * As chamadas de auth passam pelo `apiClient` (uma instância só). `isAuthCall` as tira do Bearer e da
 * renovação de sessão; `withCredentials` só nelas, que são as que recebem ou mandam o cookie do refresh.
 */
const AUTH_CALL: ApiRequestConfig = { isAuthCall: true, withCredentials: true };

/** `refresh` e `logout` leem o cookie e por isso exigem o cabeçalho anti-CSRF (a API responde 403 sem ele). */
const WITH_CSRF: ApiRequestConfig = { ...AUTH_CALL, headers: { [CSRF_HEADER]: '1' } };

export const authApi = {
  /** NÃO abre sessão: o e-mail de verificação sai e a conta só entra depois de confirmá-lo. */
  async registro(body: RegistroRequest): Promise<RegistroResponse> {
    const response = await apiClient.post<RegistroResponse>('/auth/registro', body, AUTH_CALL);
    return response.data;
  },

  async login(body: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', body, AUTH_CALL);
    return response.data;
  },

  /** Sem corpo: a API lê o cookie. Devolve o access token novo e o usuário. */
  async refresh(): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/refresh', undefined, WITH_CSRF);
    return response.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout', undefined, WITH_CSRF);
  },

  async me(): Promise<Usuario> {
    const response = await apiClient.get<Usuario>('/auth/me');
    return response.data;
  },

  /** Confirma o e-mail com o token do link. Idempotente: o mesmo link de novo não dá erro. */
  async verificarEmail(body: VerificarEmailRequest): Promise<VerificarEmailResponse> {
    const response = await apiClient.post<VerificarEmailResponse>(
      '/auth/verificar-email',
      body,
      AUTH_CALL,
    );
    return response.data;
  },

  async reenviarVerificacao(
    body: ReenviarVerificacaoRequest,
  ): Promise<ReenviarVerificacaoResponse> {
    const response = await apiClient.post<ReenviarVerificacaoResponse>(
      '/auth/reenviar-verificacao',
      body,
      AUTH_CALL,
    );
    return response.data;
  },

  /** A resposta é sempre a mesma, exista a conta ou não: a tela mostra um texto fixo. */
  async esqueciSenha(body: EsqueciSenhaRequest): Promise<void> {
    await apiClient.post('/auth/esqueci-senha', body, AUTH_CALL);
  },

  /** `isAuthCall`: o 401 `AUTH_TOKEN_INVALIDO` é do link, não uma sessão perdida (não dispara renovação). */
  async redefinirSenha(body: RedefinirSenhaRequest): Promise<void> {
    await apiClient.post('/auth/redefinir-senha', body, AUTH_CALL);
  },

  /** Rota protegida comum (Bearer e renovação): a senha errada volta 400, nunca 401. */
  async trocarSenha(body: TrocarSenhaRequest): Promise<void> {
    await apiClient.put('/auth/senha', body);
  },
};
