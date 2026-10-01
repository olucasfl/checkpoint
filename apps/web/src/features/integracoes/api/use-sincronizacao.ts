import { useIsFetching, useQueries, useQueryClient } from '@tanstack/react-query';
import { type Provedor } from '@checkpoint/shared';
import { GAMES_QUERY_KEY } from '@/features/games/api/use-games';
import { integracoesApi } from './integracoes-api';
import { resumoQueryKey, useContas } from './use-integracoes';

/**
 * A sincronização automática das horas (ao entrar no app e ao voltar para ele depois de um tempo). A chave termina no
 * provedor: `useSincronizando` filtra por ela, e o logout limpa o `queryClient` inteiro, estas junto.
 */
export const SINCRONIZACAO_QUERY_KEY = ['integracoes', 'sincronizacao'] as const;
export const sincronizacaoQueryKey = (provedor: Provedor) =>
  [...SINCRONIZACAO_QUERY_KEY, provedor] as const;

/**
 * Quanto tempo uma sincronização vale antes de a volta ao app (foco na aba) pedir outra. O servidor ainda limita a uma
 * consulta à plataforma a cada 30 s, então voltar logo em seguida não gasta a cota da chave.
 */
export const SINCRONIZACAO_VALIDA_MS = 10 * 60 * 1000;

/**
 * Uma sincronização por conta ativa, disparada sozinha: o catálogo carrega do jeito de sempre, e as horas dos jogos
 * ligados são trazidas da plataforma em segundo plano. Sucesso com alguma mudança busca o catálogo (e o que depende
 * dele) de novo. A falha é engolida de propósito: nada a explicar a quem só abriu o app, e o último valor gravado
 * continua na tela (o "Atualizar" manual segue mostrando o erro).
 */
export function useSincronizacaoAutomatica(): void {
  const queryClient = useQueryClient();
  const contas = useContas();
  // Conta que pede reautenticação não tem o que sincronizar: o servidor responderia 409.
  const ativas = (contas.data ?? []).filter((conta) => conta.estado === 'ativa');

  useQueries({
    queries: ativas.map(({ provedor }) => ({
      queryKey: sincronizacaoQueryKey(provedor),
      queryFn: async () => {
        const resultado = await integracoesApi.sincronizar(provedor);
        if (resultado.atualizados > 0) {
          void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_KEY });
          void queryClient.invalidateQueries({ queryKey: ['integracoes', 'jogo', provedor] });
          void queryClient.invalidateQueries({ queryKey: resumoQueryKey(provedor) });
        }
        return resultado;
      },
      retry: false,
      staleTime: SINCRONIZACAO_VALIDA_MS,
      refetchOnWindowFocus: true,
    })),
  });
}

/** `true` enquanto alguma das plataformas dadas está sendo sincronizada (as telas mostram as horas "carregando"). */
export function useSincronizando(provedores: readonly Provedor[]): boolean {
  const emAndamento = useIsFetching({
    predicate: (query) =>
      query.queryKey[0] === 'integracoes' &&
      query.queryKey[1] === 'sincronizacao' &&
      provedores.includes(query.queryKey[2] as Provedor),
  });
  return provedores.length > 0 && emAndamento > 0;
}
