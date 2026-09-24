import {
  GAME_RATING_MAX,
  GAME_RATING_MIN,
  statusAllowsRating,
  type GameStatus,
} from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { Field, FieldError, inputClass, LABEL } from '@/shared/components/form-parts';

interface RatingFieldProps {
  status: GameStatus;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

const SEGMENTS = Array.from({ length: GAME_RATING_MAX }, (_, index) => index);

/**
 * Nota (0 a 10). Em "Quero jogar" ela NÃO existe: o campo fica desabilitado e vazio, com um cadeado
 * (CA-43, CA-82). O contorno do desabilitado usa `apagado-2` (exceção de contraste da WCAG).
 */
export function RatingField({ status, value, error, onChange }: RatingFieldProps) {
  const locked = !statusAllowsRating(status);

  return (
    <Field>
      <label htmlFor="f-nota" className={LABEL}>
        Nota
      </label>

      {locked ? (
        <div
          data-locked="true"
          className="flex flex-wrap items-center gap-3 rounded-[4px] border border-dashed border-apagado-2 px-3.5 py-3"
        >
          <Icon name="lock" size={20} className="text-apagado-2" />
          <input
            id="f-nota"
            type="number"
            disabled
            value=""
            aria-describedby="f-nota-hint"
            className="h-10 w-20 rounded-[4px] border border-apagado-2 bg-fundo px-2.5 font-corpo text-[19px] font-semibold opacity-60"
          />
          <div aria-hidden="true" className="flex gap-[3px]">
            {SEGMENTS.map((index) => (
              <span key={index} className="h-4 w-[11px] rounded-[1px] bg-apagado opacity-40" />
            ))}
          </div>
          <span id="f-nota-hint" className="text-[15px] text-texto-suave">
            Disponível para Zerado ou Jogando
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <input
            id="f-nota"
            type="number"
            inputMode="numeric"
            min={GAME_RATING_MIN}
            max={GAME_RATING_MAX}
            step={1}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'f-nota-err' : 'f-nota-hint'}
            onChange={(event) => onChange(event.target.value)}
            className={`${inputClass(Boolean(error))} w-28`}
          />
          <span id="f-nota-hint" className="text-[15px] text-texto-suave">
            De {GAME_RATING_MIN} a {GAME_RATING_MAX} (opcional)
          </span>
        </div>
      )}

      <FieldError id="f-nota-err" message={error} />
    </Field>
  );
}
