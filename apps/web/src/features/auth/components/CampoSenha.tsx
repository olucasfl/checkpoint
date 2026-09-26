import { useState, type Ref } from 'react';
import { Icon } from '@/shared/components/Icon';
import { TextField } from './TextField';

interface CampoSenhaProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `current-password` no login; `new-password` ao criar ou trocar (o gerenciador de senhas oferece uma). */
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Campo de senha com o botão "mostrar senha": 44 × 44 (alvo de toque) e `aria-pressed` (é um botão
 * de liga/desliga). O rótulo do botão é sempre "Mostrar senha"; o estado vai no `aria-pressed`.
 */
export function CampoSenha({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  inputRef,
}: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      type={visivel ? 'text' : 'password'}
      autoComplete={autoComplete}
      error={error}
      hint={hint}
      inputRef={inputRef}
    >
      <button
        type="button"
        aria-pressed={visivel}
        aria-label="Mostrar senha"
        onClick={() => setVisivel((atual) => !atual)}
        className="absolute right-0.5 top-0.5 grid size-11 place-items-center rounded-full text-texto-suave hover:text-texto"
      >
        <Icon name={visivel ? 'visibility_off' : 'visibility'} size={22} />
      </button>
    </TextField>
  );
}
