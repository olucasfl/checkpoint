import {
  type AtualizarPerfilRequest,
  type EncerrarOutrasSessoesResponse,
  type ExcluirContaRequest,
  type SessaoAtiva,
  type Usuario,
} from '@checkpoint/shared';
import { apiClient } from '@/shared/lib/api-client';

/** Chamadas da conta do usuário logado, pelo `apiClient` (Bearer e renovação de sessão incluídos). */
export const perfilApi = {
  /** `PATCH /api/users/me`: troca o nome de exibição e devolve o usuário atualizado. */
  async atualizar(body: AtualizarPerfilRequest): Promise<Usuario> {
    const response = await apiClient.patch<Usuario>('/users/me', body);
    return response.data;
  },

  /** `GET /api/auth/sessoes`: as sessões vivas, a deste aparelho primeiro. */
  async listarSessoes(): Promise<SessaoAtiva[]> {
    const response = await apiClient.get<SessaoAtiva[]>('/auth/sessoes');
    return response.data;
  },

  /** `DELETE /api/auth/sessoes/:id`: encerra a sessão de outro aparelho. */
  async encerrarSessao(id: string): Promise<void> {
    await apiClient.delete(`/auth/sessoes/${encodeURIComponent(id)}`);
  },

  /** `POST /api/users/me/exclusao`: exclui a conta (204). Senha errada volta 400, nunca 401. */
  async excluirConta(body: ExcluirContaRequest): Promise<void> {
    await apiClient.post('/users/me/exclusao', body);
  },

  /** `DELETE /api/auth/sessoes`: encerra todas as outras; devolve quantas. */
  async encerrarOutrasSessoes(): Promise<EncerrarOutrasSessoesResponse> {
    const response = await apiClient.delete<EncerrarOutrasSessoesResponse>('/auth/sessoes');
    return response.data;
  },
};
