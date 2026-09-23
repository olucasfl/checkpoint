import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { useGames } from '@/features/games/api/use-games';
import { DeleteGameDialog } from '@/features/games/components/DeleteGameDialog';
import { GameForm } from '@/features/games/components/GameForm';
import { GameRow } from '@/features/games/components/GameRow';
import { ListEmpty, ListError, ListLoading } from '@/features/games/components/ListStates';
import { StatPanels } from '@/features/games/components/StatPanels';
import { StatusFilter } from '@/features/games/components/StatusFilter';
import { countByStatus, filterGames } from '@/features/games/lib/count-by-status';
import {
  parseStatusFilter,
  statusFilterToParams,
  type StatusFilter as Filter,
} from '@/features/games/lib/status-filter';

/** Estado do diálogo de criar/editar: fechado, novo jogo, ou edição de um jogo. */
type FormDialog = { open: false } | { open: true; game?: Game };

/**
 * Catálogo de jogos (rota `/`). Busca a lista COMPLETA uma vez; o filtro (na URL, `/?status=`) e as
 * contagens dos painéis e dos botões saem dela, no cliente.
 */
export function GamesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseStatusFilter(searchParams.get('status'));
  const { data, isPending, isError, refetch } = useGames();
  const [form, setForm] = useState<FormDialog>({ open: false });
  const [toDelete, setToDelete] = useState<Game | null>(null);

  const games = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => countByStatus(games), [games]);
  const visible = useMemo(() => filterGames(games, filter), [games, filter]);

  function changeFilter(next: Filter) {
    setSearchParams(statusFilterToParams(next));
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-14 pb-16 pt-10 max-[900px]:px-4 max-[900px]:pb-12 max-[900px]:pt-6">
      <div
        aria-hidden="true"
        className="orb orb-magenta -right-[220px] -top-[280px] size-[720px]"
      />
      <div
        aria-hidden="true"
        className="orb orb-ciano -bottom-[320px] -left-[260px] size-[760px]"
      />
      <div aria-hidden="true" className="scanlines" />

      <main className="relative mx-auto flex max-w-[1168px] flex-col gap-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="glow-logo grid size-[52px] place-items-center rounded-md border border-magenta text-magenta">
              <Icon name="flag" size={30} filled />
            </div>
            <div>
              <h1 className="glow-text-magenta m-0 font-display text-[30px] font-extrabold tracking-[0.14em]">
                CHECKPOINT
              </h1>
              <div className="text-[15px] font-semibold uppercase tracking-[0.28em] text-texto-suave">
                Seu registro de jogos
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setForm({ open: true })}
            className="cta-pulse flex h-[52px] items-center gap-2.5 rounded-[4px] bg-magenta px-6 font-display text-sm font-extrabold uppercase tracking-[0.1em] text-fundo transition-transform hover:-translate-y-0.5"
          >
            <Icon name="add_circle" size={22} />
            Adicionar jogo
          </button>
        </header>

        <StatPanels counts={counts} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusFilter filter={filter} counts={counts} onChange={changeFilter} />
          <div className="flex items-center gap-1.5 text-[15px] font-semibold uppercase tracking-[0.14em] text-texto-suave">
            <Icon name="history" size={18} />
            Última atualização primeiro
          </div>
        </div>

        {isPending && <ListLoading />}
        {isError && <ListError onRetry={() => void refetch()} />}
        {!isPending && !isError && visible.length === 0 && (
          <ListEmpty filtered={filter !== 'TODOS' && games.length > 0} />
        )}
        {visible.length > 0 && (
          <ul aria-label="Jogos" className="m-0 flex list-none flex-col gap-2.5 p-0">
            {visible.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                onEdit={(target) => setForm({ open: true, game: target })}
                onRemove={setToDelete}
              />
            ))}
          </ul>
        )}
      </main>

      <ModalDialog
        open={form.open}
        onClose={() => setForm({ open: false })}
        labelledBy="game-dialog-title"
      >
        {form.open && (
          <GameForm
            game={form.game}
            onDone={() => setForm({ open: false })}
            onCancel={() => setForm({ open: false })}
          />
        )}
      </ModalDialog>

      <DeleteGameDialog game={toDelete} onClose={() => setToDelete(null)} />
    </div>
  );
}
