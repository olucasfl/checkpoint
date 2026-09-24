import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { perfilApi } from './perfil-api';

/** As sessões do usuário logado. O logout local limpa o `queryClient` inteiro, esta chave junto. */
export const SESSOES_QUERY_KEY = ['sessoes'] as const;

export function useSessoes() {
  return useQuery({ queryKey: SESSOES_QUERY_KEY, queryFn: () => perfilApi.listarSessoes() });
}

/**
 * Encerrar uma sessão ou todas as outras. Com sucesso OU erro, a lista é buscada de novo: um 404
 * (outro aparelho já encerrou aquela sessão) também deixa a lista desatualizada.
 */
export function useEncerrarSessao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => perfilApi.encerrarSessao(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSOES_QUERY_KEY }),
  });
}

export function useEncerrarOutrasSessoes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => perfilApi.encerrarOutrasSessoes(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SESSOES_QUERY_KEY }),
  });
}
