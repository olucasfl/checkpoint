import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveGame, type SaveGameInput } from '../lib/save-game';
import { gamesApi } from './games-api';

/** Uma única query: a lista COMPLETA. Filtro e contagens saem dela, no cliente. */
export const GAMES_QUERY_KEY = ['games'] as const;

export function useGames() {
  return useQuery({ queryKey: GAMES_QUERY_KEY, queryFn: () => gamesApi.list() });
}

/** Criar/editar + capa. Atualiza a lista mesmo quando só a capa falhou (o jogo foi salvo). */
export function useSaveGame() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveGameInput) => saveGame(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: GAMES_QUERY_KEY }),
  });
}

export function useDeleteGame() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => gamesApi.remove(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: GAMES_QUERY_KEY }),
  });
}
