import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type PerfilPlataforma, type Provedor, type VincularJogoRequest } from '@checkpoint/shared';
import { GAMES_QUERY_KEY } from '@/features/games/api/use-games';
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

export const bibliotecaQueryKey = (provedor: Provedor, busca: string) =>
  ['integracoes', 'biblioteca', provedor, busca] as const;

/**
 * A biblioteca para escolher o jogo a ligar. Sem _retry_ (409 privado e 502 têm o "Tentar de novo" da tela) e sem
 * dado antigo: o servidor guarda 10 min de cache, então buscar de novo ao abrir é barato e mostra os vínculos atuais.
 */
export function useBiblioteca(provedor: Provedor, busca: string, enabled: boolean) {
  return useQuery({
    queryKey: bibliotecaQueryKey(provedor, busca),
    queryFn: () => integracoesApi.biblioteca(provedor, busca),
    enabled,
    retry: false,
    gcTime: 0,
  });
}

/** Ligar um jogo a um item: o catálogo (que traz `dadosPlataforma`) e o cartão do perfil são buscados de novo. */
export function useVincularJogo(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: { jogoId: string } & VincularJogoRequest) =>
      integracoesApi.vincularJogo(provedor, entrada.jogoId, {
        idExterno: entrada.idExterno,
        ...(entrada.mover ? { mover: true } : {}),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: perfilQueryKey(provedor) });
    },
  });
}

/** Desvincular um jogo (só a camada da plataforma). */
export function useDesvincularJogo(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jogoId: string) => integracoesApi.desvincularJogo(provedor, jogoId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: perfilQueryKey(provedor) });
    },
  });
}
