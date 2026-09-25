import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type PerfilPlataforma, type Provedor } from '@checkpoint/shared';
import { integracoesApi } from './integracoes-api';

/** As contas vinculadas. O logout local limpa o `queryClient` inteiro, estas chaves junto. */
export const CONTAS_QUERY_KEY = ['integracoes', 'contas'] as const;
export const perfilQueryKey = (provedor: Provedor) => ['integracoes', 'perfil', provedor] as const;

export function useContas() {
  return useQuery({ queryKey: CONTAS_QUERY_KEY, queryFn: () => integracoesApi.listarContas() });
}

/**
 * O cartão do perfil, só depois de saber que há conta vinculada (`enabled`). Sem _retry_: 409 (privado) e 502
 * são respostas que a pessoa resolve com "Tentar de novo", não falhas passageiras para repetir sozinho.
 */
export function usePerfilPlataforma(provedor: Provedor, enabled: boolean) {
  return useQuery({
    queryKey: perfilQueryKey(provedor),
    queryFn: () => integracoesApi.perfil(provedor),
    enabled,
    retry: false,
  });
}

export function useIniciarVinculo(provedor: Provedor) {
  return useMutation({ mutationFn: () => integracoesApi.iniciarVinculo(provedor) });
}

/** O "Atualizar" do cartão: o resultado entra direto no cache do perfil. */
export function useAtualizarPerfil(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integracoesApi.atualizarPerfil(provedor),
    onSuccess: (perfil: PerfilPlataforma) => {
      queryClient.setQueryData(perfilQueryKey(provedor), perfil);
    },
  });
}

/** Desvincular: a conta e o cartão saem do cache, e a lista de contas é buscada de novo. */
export function useDesvincular(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integracoesApi.desvincular(provedor),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: perfilQueryKey(provedor) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONTAS_QUERY_KEY }),
  });
}
