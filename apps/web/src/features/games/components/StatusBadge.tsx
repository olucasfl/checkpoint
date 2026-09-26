import { type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { STATUS_META } from '../lib/status-meta';

/** Chip do status: ícone e rótulo na cor do status, sobre o status a 18% (a informação nunca depende só da cor). */
export function StatusBadge({ status }: { status: GameStatus }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={`inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-bold ${meta.text} ${meta.tint}`}
    >
      <Icon name={meta.icon} size={18} filled />
      {meta.label}
    </span>
  );
}
