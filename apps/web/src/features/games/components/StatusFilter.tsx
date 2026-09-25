import { useEffect, useRef } from 'react';
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

/**
 * Botões de filtro com ícone, rótulo e contagem. O ativo fica na cor do destaque, com aria-pressed.
 * No celular é uma fileira só que rola na horizontal dentro dela mesma (a página não rola de lado).
 */
export function StatusFilter({ filter, counts, onChange }: StatusFilterProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Traz o filtro ativo para a vista na fileira (ex.: abrir `/?status=ZERADO`). Mexe só no
  // scrollLeft da fileira: scrollIntoView também rolaria a página na vertical.
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && active && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = active.offsetLeft - row.offsetLeft;
    }
  }, [filter]);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Filtrar por status"
      className="scroll-row flex w-full snap-x gap-2.5 overflow-x-auto md:w-auto md:flex-wrap md:overflow-visible"
    >
      {FILTER_ORDER.map((option) => {
        const active = option === filter;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-[4px] border px-4 text-[17px] font-bold uppercase tracking-[0.08em] transition-colors md:px-[18px] ${
              active
                ? 'border-destaque bg-destaque text-fundo'
                : 'border-borda-controle bg-painel-2 text-texto-suave hover:border-destaque hover:text-texto'
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
