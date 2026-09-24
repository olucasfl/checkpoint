import { QueryClient } from '@tanstack/react-query';

/**
 * `networkMode: 'always'`: o padrão ('online') PAUSA a consulta quando `navigator.onLine` é falso, e
 * o app ficaria carregando para sempre em vez de mostrar o erro. Quem decide o que mostrar sem
 * conexão é o detector de `connectivity.ts`, não o React Query.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      networkMode: 'always',
    },
  },
});
