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
 * Filtros em pílulas de 44 px com ícone, rótulo e contagem, `aria-pressed`. A ativa tem fundo `texto` e texto `fundo`.
 * No desktop o grupo é um contêiner em pílula (`painel` com `borda`) e as inativas não têm contorno; no celular é uma
 * fileira que rola na horizontal DENTRO dela (a página não rola de lado) e cada inativa leva `borda-controle` (a `borda`
 * decorativa não passa de 3:1). Traz o filtro ativo para a vista ao abrir `/?status=ZERADO`.
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
      className="scroll-row flex w-full snap-x gap-2 overflow-x-auto md:w-auto md:min-w-0 md:gap-1 md:rounded-full md:border md:border-borda md:bg-painel md:p-[5px]"
    >
      {FILTER_ORDER.map((option) => {
        const active = option === filter;

        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`flex h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border px-[18px] font-display text-[15px] transition-colors md:px-5 ${
              active
                ? 'border-transparent bg-texto font-bold text-fundo'
                : 'border-borda-controle bg-painel font-semibold text-texto-suave hover:text-texto md:border-transparent md:bg-transparent'
            }`}
          >
            <Icon name={iconOf(option)} size={19} filled={active} />
            {labelOf(option)}
            <span
              className={`text-xs font-extrabold ${active ? 'text-fundo/70' : 'text-texto-suave'}`}
            >
              {countOf(option, counts)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
