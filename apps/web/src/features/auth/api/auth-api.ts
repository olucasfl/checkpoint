import {
  CSRF_HEADER,
  type AuthResponse,
  type LoginRequest,
  type RegistroRequest,
  type TrocarSenhaRequest,
  type Usuario,
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
  async registro(body: RegistroRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/registro', body, AUTH_CALL);
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

  /** Rota protegida comum (Bearer e renovação): a senha errada volta 400, nunca 401. */
  async trocarSenha(body: TrocarSenhaRequest): Promise<void> {
    await apiClient.put('/auth/senha', body);
  },
};
