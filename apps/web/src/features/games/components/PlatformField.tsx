import { Icon } from '@/shared/components/Icon';
import { extraPlatform, groupsWithFavorites } from '../lib/platforms';
import { Field, FieldError, inputClass, LABEL } from '@/shared/components/form-parts';

interface PlatformFieldProps {
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  /** Plataformas favoritas (preferência do /perfil): vêm primeiro, num grupo próprio. */
  favoritas?: readonly string[];
}

/**
 * Plataforma: seleção das mais usadas (PC, PS5, Nintendo Switch, Xbox 360...), agrupadas. "Sem
 * plataforma" é a primeira opção e o padrão. `<select>` nativo, sem biblioteca; a seta é própria
 * para combinar com o tema escuro.
 */
export function PlatformField({ value, error, onChange, favoritas = [] }: PlatformFieldProps) {
  const extra = extraPlatform(value);
  const groups = groupsWithFavorites(favoritas);

  return (
    <Field>
      <label htmlFor="f-plataforma" className={LABEL}>
        Plataforma <small className="text-sm normal-case tracking-[0.06em]">(opcional)</small>
      </label>

      <div className="relative">
        <select
          id="f-plataforma"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'f-plataforma-err' : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass(Boolean(error))} w-full appearance-none pr-11`}
        >
          <option value="">Sem plataforma</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </optgroup>
          ))}
          {extra && (
            <optgroup label="Cadastrada antes">
              <option value={extra}>{extra}</option>
            </optgroup>
          )}
        </select>
        <Icon
          name="expand_more"
          size={24}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-texto-suave"
        />
      </div>

      <FieldError id="f-plataforma-err" message={error} />
    </Field>
  );
}
