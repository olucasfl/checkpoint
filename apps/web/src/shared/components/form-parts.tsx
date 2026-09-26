import { type ReactNode } from 'react';
import { Icon } from '@/shared/components/Icon';

export const LABEL = 'text-[13px] font-bold uppercase tracking-[0.14em] text-texto-suave';

const INPUT_BASE =
  'h-[52px] rounded-xl border bg-fundo px-3.5 font-corpo text-base font-semibold text-texto placeholder:text-texto-suave focus:border-destaque focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-destaque)_35%,transparent)]';

/** Contorno de controle em `borda-controle`; com erro, borda `erro`, brilho e o tremer curto. */
export function inputClass(hasError: boolean): string {
  return `${INPUT_BASE} ${hasError ? 'shake-error border-erro' : 'border-borda-controle'}`;
}

/** Mensagem de erro junto do campo: ícone + texto em `erro`, anunciada aos leitores de tela. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) {
    return null;
  }

  return (
    <p
      id={id}
      role="alert"
      className="m-0 flex items-center gap-1.5 text-base font-semibold text-erro"
    >
      <Icon name="error" size={18} filled />
      {message}
    </p>
  );
}

/** Um campo do formulário: rótulo + controle + erro. */
export function Field({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}
