import { type ReactNode, type Ref } from 'react';
import { Field, FieldError, inputClass, LABEL } from '@/shared/components/form-parts';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  inputMode?: 'email' | 'text';
  autoCapitalize?: 'off' | 'words';
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Conteúdo dentro do contêiner do campo (ex.: o botão "mostrar senha"). */
  children?: ReactNode;
  hint?: string;
}

/**
 * Um campo de texto do formulário de auth: rótulo, controle com o contorno `borda-controle`, dica e
 * erro ligados por `aria-describedby`. Fonte de 19px (piso de 16px: o iOS não dá zoom ao focar).
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  autoCapitalize = 'off',
  error,
  inputRef,
  children,
  hint,
}: TextFieldProps) {
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Field>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${inputClass(Boolean(error))} w-full`}
        />
        {children}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="m-0 text-[15px] text-texto-suave">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-err`} message={error} />
    </Field>
  );
}
