import { type AtualizarPerfilRequest, type Usuario } from '@checkpoint/shared';
import { apiClient } from '@/shared/lib/api-client';

/** Chamadas da conta do usuário logado, pelo `apiClient` (Bearer e renovação de sessão incluídos). */
export const perfilApi = {
  /** `PATCH /api/users/me`: troca o nome de exibição e devolve o usuário atualizado. */
  async atualizar(body: AtualizarPerfilRequest): Promise<Usuario> {
    const response = await apiClient.patch<Usuario>('/users/me', body);
    return response.data;
  },
};
