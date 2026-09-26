import { GAME_DESCRIPTION_MAX_LENGTH } from '@checkpoint/shared';
import { Field, FieldError, inputClass, LABEL } from '@/shared/components/form-parts';

interface DescricaoFieldProps {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}

/**
 * A descrição do jogo: texto simples (sem Markdown nem HTML), até 1000 caracteres, com as quebras de linha
 * preservadas. O `maxLength` impede passar do limite; o contador `n/1000` mostra quanto falta.
 */
export function DescricaoField({ value, error, onChange }: DescricaoFieldProps) {
  return (
    <Field>
      <label htmlFor="f-descricao" className={LABEL}>
        Descrição <span className="font-normal normal-case tracking-normal">(opcional)</span>
      </label>
      <textarea
        id="f-descricao"
        rows={4}
        maxLength={GAME_DESCRIPTION_MAX_LENGTH}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'f-descricao-err' : 'f-descricao-contador'}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass(Boolean(error))} h-auto! min-h-[110px] resize-y py-2.5 font-corpo`}
      />
      <div className="flex justify-between gap-3">
        <FieldError id="f-descricao-err" message={error} />
        <span
          id="f-descricao-contador"
          className="ml-auto text-[15px] tabular-nums text-texto-suave"
        >
          {value.length}/{GAME_DESCRIPTION_MAX_LENGTH}
        </span>
      </div>
    </Field>
  );
}
