import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type DetalheJogoPlataforma,
  type Game,
  type ResumoContaPlataforma,
  type Provedor,
  type VincularJogoRequest,
} from '@checkpoint/shared';
import { GAMES_QUERY_KEY } from '@/features/games/api/use-games';
import { comDadosAtualizados } from '../lib/conquistas';
import { PROVEDOR_STEAM } from '../lib/provedores';
import { integracoesApi } from './integracoes-api';

/** As contas vinculadas. O logout local limpa o `queryClient` inteiro, estas chaves junto. */
export const CONTAS_QUERY_KEY = ['integracoes', 'contas'] as const;
export const resumoQueryKey = (provedor: Provedor) => ['integracoes', 'resumo', provedor] as const;

export function useContas() {
  return useQuery({ queryKey: CONTAS_QUERY_KEY, queryFn: () => integracoesApi.listarContas() });
}

/**
 * O resumo da conta (o popup da plataforma), só depois de saber que há conta vinculada (`enabled`). Sem _retry_: 409 (privado) e 502
 * são respostas que a pessoa resolve com "Tentar de novo", não falhas passageiras para repetir sozinho.
 */
export function useResumoPlataforma(provedor: Provedor, enabled: boolean) {
  return useQuery({
    queryKey: resumoQueryKey(provedor),
    queryFn: () => integracoesApi.resumo(provedor),
    enabled,
    retry: false,
  });
}

/** Há conta Steam vinculada? `undefined` enquanto carrega ou se a consulta falhou (a tela some com o atalho). */
export function useTemConta(provedor: Provedor): boolean | undefined {
  const contas = useContas();
  return contas.data?.some((conta) => conta.provedor === provedor);
}

/** O atalho das telas que só falam com a Steam (ver `lib/provedores.ts`). */
export function useTemContaSteam(): boolean | undefined {
  return useTemConta(PROVEDOR_STEAM);
}

export function useIniciarVinculo(provedor: Provedor) {
  return useMutation({ mutationFn: () => integracoesApi.iniciarVinculo(provedor) });
}

/** O "Atualizar" do popup: o resultado entra direto no cache do resumo. */
export function useAtualizarResumo(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integracoesApi.atualizarResumo(provedor),
    onSuccess: (resumo: ResumoContaPlataforma) => {
      queryClient.setQueryData(resumoQueryKey(provedor), resumo);
    },
  });
}

/** Desvincular: a conta e o cartão saem do cache, e a lista de contas é buscada de novo. */
export function useDesvincular(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integracoesApi.desvincular(provedor),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: resumoQueryKey(provedor) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONTAS_QUERY_KEY }),
  });
}

export const bibliotecaQueryKey = (provedor: Provedor, busca: string, soNuncaJogados = false) =>
  soNuncaJogados
    ? (['integracoes', 'biblioteca', provedor, busca, 'nunca-jogados'] as const)
    : (['integracoes', 'biblioteca', provedor, busca] as const);

/**
 * A biblioteca para escolher o jogo a ligar. Sem _retry_ (409 privado e 502 têm o "Tentar de novo" da tela) e sem
 * dado antigo: o servidor guarda 10 min de cache, então buscar de novo ao abrir é barato e mostra os vínculos atuais.
 */
export function useBiblioteca(
  provedor: Provedor,
  busca: string,
  enabled: boolean,
  soNuncaJogados = false,
) {
  return useQuery({
    queryKey: bibliotecaQueryKey(provedor, busca, soNuncaJogados),
    queryFn: () =>
      soNuncaJogados
        ? integracoesApi.biblioteca(provedor, busca, { nuncaJogados: true })
        : integracoesApi.biblioteca(provedor, busca),
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
      void queryClient.invalidateQueries({ queryKey: resumoQueryKey(provedor) });
    },
  });
}

export const detalheQueryKey = (provedor: Provedor, jogoId: string) =>
  ['integracoes', 'jogo', provedor, jogoId] as const;

/**
 * O detalhe de um jogo ligado (horas e conquistas). Só é pedido quando `enabled` (a página do jogo já sabe que ele
 * tem vínculo), então abrir `/` nunca consulta conquistas. Sem _retry_: o servidor já devolve o valor gravado com
 * um aviso quando a plataforma falha. Os valores novos entram direto no cache do catálogo (a linha "42 h · 12/40").
 */
export function useDetalheJogo(provedor: Provedor, jogoId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: detalheQueryKey(provedor, jogoId),
    queryFn: async () => {
      const detalhe = await integracoesApi.detalheDoJogo(provedor, jogoId);
      queryClient.setQueryData<Game[]>(GAMES_QUERY_KEY, (jogos) =>
        comDadosAtualizados(jogos, jogoId, detalhe.dados),
      );
      return detalhe;
    },
    enabled,
    retry: false,
  });
}

/** O "Atualizar" do bloco: o resultado entra no cache do detalhe e no do catálogo. */
export function useAtualizarJogo(provedor: Provedor, jogoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integracoesApi.atualizarJogo(provedor, jogoId),
    onSuccess: (detalhe: DetalheJogoPlataforma) => {
      queryClient.setQueryData(detalheQueryKey(provedor, jogoId), detalhe);
      queryClient.setQueryData<Game[]>(GAMES_QUERY_KEY, (jogos) =>
        comDadosAtualizados(jogos, jogoId, detalhe.dados),
      );
    },
  });
}

/** Desvincular um jogo (só a camada da plataforma). */
export function useDesvincularJogo(provedor: Provedor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jogoId: string) => integracoesApi.desvincularJogo(provedor, jogoId),
    onSuccess: (_resultado, jogoId) => {
      queryClient.removeQueries({ queryKey: detalheQueryKey(provedor, jogoId) });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: resumoQueryKey(provedor) });
    },
  });
}
