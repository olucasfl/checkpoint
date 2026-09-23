import {
  GAME_COVER_FIELD,
  type CreateGameRequest,
  type Game,
  type UpdateGameRequest,
} from '@checkpoint/shared';
import { apiClient } from '@/shared/lib/api-client';

/**
 * Chamadas da feature à API. Toda requisição passa pelo `apiClient` (uma instância só) e os tipos
 * vêm de `@checkpoint/shared`. O web busca a lista COMPLETA: filtro e contagens são feitos no cliente.
 */
export const gamesApi = {
  async list(): Promise<Game[]> {
    const response = await apiClient.get<Game[]>('/games');
    return response.data;
  },

  async create(body: CreateGameRequest): Promise<Game> {
    const response = await apiClient.post<Game>('/games', body);
    return response.data;
  },

  async update(id: string, body: UpdateGameRequest): Promise<Game> {
    const response = await apiClient.patch<Game>(`/games/${id}`, body);
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/games/${id}`);
  },

  /** Envia (ou troca) a capa: multipart no campo `arquivo`, em requisição separada do JSON do jogo. */
  async uploadCover(id: string, file: File): Promise<Game> {
    const form = new FormData();
    form.append(GAME_COVER_FIELD, file);
    // O apiClient tem `Content-Type: application/json` por padrão e, nesse caso, o axios converte o
    // FormData em JSON (a API então não recebe arquivo nenhum: 400). Com multipart/form-data o corpo
    // segue como FormData e o navegador acrescenta o boundary.
    const response = await apiClient.put<Game>(`/games/${id}/capa`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async removeCover(id: string): Promise<Game> {
    const response = await apiClient.delete<Game>(`/games/${id}/capa`);
    return response.data;
  },
};

/** O que `saveGame` precisa da API (injetável nos testes). */
export type GamesApi = Pick<typeof gamesApi, 'create' | 'update' | 'uploadCover' | 'removeCover'>;
