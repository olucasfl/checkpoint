import { type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { STATUS_META } from '../lib/status-meta';
import { LABEL } from '@/shared/components/form-parts';

interface StatusPickerProps {
  value: GameStatus;
  onChange: (status: GameStatus) => void;
}

/** A ordem da estante e dos filtros (o formulário antigo usava Zerado, Jogando, Quero jogar). */
const ORDEM: readonly GameStatus[] = ['JOGANDO', 'QUERO_JOGAR', 'ZERADO'];

/** Status como 3 botões de 52 px com ícone e aria-pressed: exatamente um fica ativo (fundo `texto`, texto `fundo`). */
export function StatusPicker({ value, onChange }: StatusPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div id="f-status" className={LABEL}>
        Status
      </div>
      <div role="group" aria-labelledby="f-status" className="grid grid-cols-3 gap-2">
        {ORDEM.map((status) => {
          const meta = STATUS_META[status];
          const pressed = status === value;

          return (
            <button
              key={status}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(status)}
              className={`flex h-[52px] items-center justify-center gap-1.5 rounded-xl border px-1 font-display text-[13px] font-bold transition-colors sm:gap-2 sm:text-[15px] ${
                pressed
                  ? 'border-transparent bg-texto text-fundo'
                  : 'border-borda-controle bg-fundo text-texto-suave hover:text-texto'
              }`}
            >
              <Icon name={meta.icon} size={20} filled={pressed} />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
