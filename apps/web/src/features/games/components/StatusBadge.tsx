import { type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { STATUS_META } from '../lib/status-meta';

/** Selo do status na linha. "Jogando" leva um ponto piscando (parado com movimento reduzido). */
export function StatusBadge({ status }: { status: GameStatus }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border border-current px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.14em] ${meta.text} ${meta.tint}`}
    >
      {status === 'JOGANDO' ? (
        <span
          aria-hidden="true"
          className="dot-blink size-[7px] rounded-full bg-ciano shadow-[0_0_10px_var(--color-ciano)]"
        />
      ) : (
        <Icon name={meta.icon} size={16} filled />
      )}
      {meta.label}
    </span>
  );
}
