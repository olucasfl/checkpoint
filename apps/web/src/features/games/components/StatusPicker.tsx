import { GAME_STATUS, type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { STATUS_META } from '../lib/status-meta';
import { LABEL } from '@/shared/components/form-parts';

interface StatusPickerProps {
  value: GameStatus;
  onChange: (status: GameStatus) => void;
}

/** Status como 3 botões com ícone e aria-pressed: exatamente um fica ativo. */
export function StatusPicker({ value, onChange }: StatusPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div id="f-status" className={LABEL}>
        Status
      </div>
      <div role="group" aria-labelledby="f-status" className="grid grid-cols-3 gap-2">
        {GAME_STATUS.map((status) => {
          const meta = STATUS_META[status];
          const pressed = status === value;

          return (
            <button
              key={status}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(status)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[4px] border text-[15px] font-bold uppercase tracking-[0.08em] ${
                pressed
                  ? `${meta.border} ${meta.text} ${meta.tint}`
                  : 'border-borda-controle bg-fundo text-texto-suave hover:text-texto'
              }`}
            >
              <Icon name={meta.icon} size={22} filled={pressed} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
