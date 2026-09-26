import { useQuery } from '@tanstack/react-query';
import { type HealthCheckResponse } from '@checkpoint/shared';
import { apiClient } from '@/shared/lib/api-client';

/** Diagnostico de saude (rota /status): valida a integracao web <-> api. Antes era a home. */
export function StatusPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await apiClient.get<HealthCheckResponse>('/health');
      return response.data;
    },
  });

  return (
    <main className="safe-x flex min-h-[70vh] flex-col items-center justify-center gap-6 py-10">
      <div className="text-center">
        <h1 className="m-0 font-display text-4xl font-extrabold tracking-[-0.02em]">Checkpoint</h1>
        <p className="mt-2 text-texto-suave">Estrutura inicial do projeto</p>
      </div>

      <section className="w-full max-w-md rounded-[22px] border border-borda bg-painel p-6">
        <h2 className="m-0 text-[13px] font-bold uppercase tracking-[0.14em] text-texto-suave">
          Status da API
        </h2>

        {isPending && (
          <p role="status" className="mt-3 text-texto-suave">
            Consultando /health...
          </p>
        )}

        {isError && (
          <p role="alert" className="mt-3 font-semibold text-erro-texto">
            Nao foi possivel falar com a API. Confira se ela esta rodando.
          </p>
        )}

        {data && (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-texto-suave">status</dt>
              <dd className="m-0 font-mono">{data.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-texto-suave">database</dt>
              <dd className="m-0 font-mono">{data.database}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-texto-suave">timestamp</dt>
              <dd className="m-0 font-mono [overflow-wrap:anywhere]">{data.timestamp}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
