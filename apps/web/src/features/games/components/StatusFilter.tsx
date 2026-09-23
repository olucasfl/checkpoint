import { Icon } from '@/shared/components/Icon';
import { type StatusCounts } from '../lib/count-by-status';
import { FILTER_ORDER, type StatusFilter as Filter } from '../lib/status-filter';
import { STATUS_META } from '../lib/status-meta';

interface StatusFilterProps {
  filter: Filter;
  counts: StatusCounts;
  onChange: (filter: Filter) => void;
}

function labelOf(filter: Filter): string {
  return filter === 'TODOS' ? 'Todos' : STATUS_META[filter].label;
}

function iconOf(filter: Filter): string {
  return filter === 'TODOS' ? 'apps' : STATUS_META[filter].icon;
}

function countOf(filter: Filter, counts: StatusCounts): number {
  return filter === 'TODOS' ? counts.total : counts[filter];
}

/** Botões de filtro com ícone, rótulo e contagem. O ativo fica ciano, com brilho e aria-pressed. */
export function StatusFilter({ filter, counts, onChange }: StatusFilterProps) {
  return (
    <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-2.5">
      {FILTER_ORDER.map((option) => {
        const active = option === filter;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`flex min-h-11 items-center gap-2 rounded-[4px] border px-[18px] text-[17px] font-bold uppercase tracking-[0.08em] transition-colors ${
              active
                ? 'glow-ciano border-ciano bg-ciano text-fundo'
                : 'border-borda-controle bg-painel-2 text-texto-suave hover:border-ciano hover:text-texto'
            }`}
          >
            <Icon name={iconOf(option)} size={20} />
            {labelOf(option)}
            <span className="font-display text-xs font-extrabold">{countOf(option, counts)}</span>
          </button>
        );
      })}
    </div>
  );
}
