import { useQuery } from '@tanstack/react-query';
import { type HealthCheckResponse } from '@checkpoint/shared';
import { apiClient } from '@/shared/lib/api-client';

/** Pagina placeholder: existe apenas para validar a integracao web <-> api. */
export function HomePage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await apiClient.get<HealthCheckResponse>('/health');
      return response.data;
    },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 p-8 text-slate-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">checkpoint</h1>
        <p className="mt-2 text-slate-400">Estrutura inicial do projeto</p>
      </div>

      <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Status da API
        </h2>

        {isPending && <p className="mt-3 text-slate-300">Consultando /health...</p>}

        {isError && (
          <p className="mt-3 text-red-400">
            Nao foi possivel falar com a API. Confira se ela esta rodando.
          </p>
        )}

        {data && (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">status</dt>
              <dd className="font-mono">{data.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">database</dt>
              <dd className="font-mono">{data.database}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">timestamp</dt>
              <dd className="font-mono">{data.timestamp}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
