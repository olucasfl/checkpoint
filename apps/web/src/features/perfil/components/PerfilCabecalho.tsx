import { useMemo } from 'react';
import { useAuth } from '@/features/auth/session/use-auth';
import { useGames } from '@/features/games/api/use-games';
import { countByStatus } from '@/features/games/lib/count-by-status';
import { coverBackground, coverInitials } from '@/shared/lib/game-cover';
import { membroDesde, resumoDoCatalogo } from '../lib/resumo';
import { NomeEditavel } from './NomeEditavel';

/**
 * Cabeçalho do perfil: avatar de iniciais (a mesma regra da capa gerada dos jogos, aplicada ao nome),
 * nome, e-mail marcado como não verificado, "Membro desde" e o resumo do catálogo, calculado da
 * mesma query `['games']` do catálogo (sem endpoint novo; "—" enquanto carrega).
 */
export function PerfilCabecalho() {
  const { usuario } = useAuth();
  const { data } = useGames();
  const counts = useMemo(() => (data ? countByStatus(data) : undefined), [data]);
  const nome = usuario?.nome ?? '';
  const desde = usuario ? membroDesde(usuario.criadoEm) : null;

  return (
    <section
      aria-label="Resumo da conta"
      className="flex min-w-0 items-start gap-4 rounded-md border border-borda bg-painel p-5 md:p-6"
    >
      <div
        aria-hidden="true"
        data-avatar
        className={`grid size-16 shrink-0 place-items-center rounded-md font-display text-[24px] font-extrabold text-fundo ${coverBackground(nome)}`}
      >
        {coverInitials(nome)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NomeEditavel />
        <p className="m-0 text-[16px] [overflow-wrap:anywhere]">{usuario?.email}</p>
        <p className="m-0 text-[15px] text-texto-suave">(não verificado — usado só para entrar)</p>
        {desde && <p className="m-0 text-[15px] text-texto-suave">{desde}</p>}
        <p data-resumo className="m-0 text-[15px] font-semibold text-ciano">
          {resumoDoCatalogo(counts)}
        </p>
      </div>
    </section>
  );
}
