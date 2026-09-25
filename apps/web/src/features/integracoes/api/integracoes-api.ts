import {
  PROVEDOR_SLUG,
  type ContaVinculada,
  type IniciarVinculoResponse,
  type PerfilPlataforma,
  type Provedor,
} from '@checkpoint/shared';
import { apiClient } from '@/shared/lib/api-client';

const rota = (provedor: Provedor): string => `/integracoes/${PROVEDOR_SLUG[provedor]}`;

/** Chamadas das integrações com plataformas, pelo `apiClient` (Bearer e renovação de sessão incluídos). */
export const integracoesApi = {
  /** `GET /api/integracoes`: as contas vinculadas do usuário. */
  async listarContas(): Promise<ContaVinculada[]> {
    const response = await apiClient.get<ContaVinculada[]>('/integracoes');
    return response.data;
  },

  /**
   * `POST /api/integracoes/:provedor/vinculo`: devolve para onde o navegador deve ir e grava o cookie
   * `checkpoint_vinculo`. `withCredentials` só aqui: em produção o `/api` é do mesmo site (o rewrite da Vercel)
   * e não muda nada, mas em dev (localhost:5173 → :3333) o navegador só aceita o cookie com ele.
   */
  async iniciarVinculo(provedor: Provedor): Promise<IniciarVinculoResponse> {
    const response = await apiClient.post<IniciarVinculoResponse>(
      `${rota(provedor)}/vinculo`,
      undefined,
      { withCredentials: true },
    );
    return response.data;
  },

  /** `GET /api/integracoes/:provedor/perfil`: o cartão (409 se privado ou não vinculado, 502 se a Steam falhou). */
  async perfil(provedor: Provedor): Promise<PerfilPlataforma> {
    const response = await apiClient.get<PerfilPlataforma>(`${rota(provedor)}/perfil`);
    return response.data;
  },

  /** `POST /api/integracoes/:provedor/perfil/atualizacao`: ignora o cache (no máximo uma consulta a cada 30 s). */
  async atualizarPerfil(provedor: Provedor): Promise<PerfilPlataforma> {
    const response = await apiClient.post<PerfilPlataforma>(`${rota(provedor)}/perfil/atualizacao`);
    return response.data;
  },

  /** `DELETE /api/integracoes/:provedor` (204): desvincula e apaga os dados da plataforma dos jogos. */
  async desvincular(provedor: Provedor): Promise<void> {
    await apiClient.delete(rota(provedor));
  },
};
